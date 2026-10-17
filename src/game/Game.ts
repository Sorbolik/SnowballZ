import * as THREE from 'three'
import { Bot } from './bot'
import {
  createFighter, createSnowball, disposeShared,
  FIGHTER_RADIUS, MAX_LIVES, SNOWBALL_RADIUS, SNOWBALL_RANGE,
  type Fighter, type Snowball,
} from './entities'
import { Input } from './input'
import { GameMap, GRID, HALF, TILE, rng } from './map'
import { palette } from './palette'

export type GameState = 'ready' | 'playing' | 'over'
export type Winner = 'player' | 'bot'

export type GameEvents = {
  onLives(player: number, bot: number): void
  onOver(winner: Winner): void
}

type Puff = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }

const PLAYER_SPEED = 6
const BOT_SPEED = 5
const PLAYER_FIRE_INTERVAL = 0.32
const INVULNERABLE_TIME = 1.4
const KNOCKBACK = 0.6

export class Game {
  state: GameState = 'ready'

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  private world = new THREE.Group()
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private raycaster = new THREE.Raycaster()

  private map!: GameMap
  private bot!: Bot
  private rand = Math.random
  private player: Fighter
  private enemy: Fighter
  private balls: Snowball[] = []
  private puffs: Puff[] = []
  private playerVel = { x: 0, z: 0 }

  private input: Input
  private raf = 0
  private last = 0
  private running = false
  private destroyed = false
  private resizeObserver: ResizeObserver

  constructor(
    private readonly mount: HTMLElement,
    focusTarget: HTMLElement,
    joyBase: HTMLElement,
    joyKnob: HTMLElement,
    private readonly events: GameEvents,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(palette.ink)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    mount.appendChild(this.renderer.domElement)

    this.scene.add(this.world)
    this.scene.add(new THREE.HemisphereLight(0xffffff, palette.ink2, 1.9))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-12, 24, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const s = HALF + 2
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 70 })
    sun.shadow.bias = -0.0006
    this.scene.add(sun)

    this.player = createFighter(palette.red, palette.cream, PLAYER_SPEED)
    this.enemy = createFighter(palette.navy, palette.red, BOT_SPEED)
    this.scene.add(this.player.group, this.enemy.group)

    this.input = new Input(focusTarget, this.renderer.domElement, joyBase, joyKnob)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(mount)
    this.resize()

    this.newRound()
    this.render()
  }

  /** Nuova mappa, vite piene, tutti al punto di partenza. */
  newRound(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.rand = rng(seed ^ 0x9e3779b9)
    this.map = new GameMap(seed)
    this.bot = new Bot(this.map, this.rand)
    this.buildWorld()

    for (const [f, spawn] of [[this.player, this.map.playerSpawn], [this.enemy, this.map.botSpawn]] as const) {
      const c = GameMap.center(spawn)
      Object.assign(f, { x: c.x, z: c.z, lives: MAX_LIVES, invulnerable: 0, cooldown: 0.6 })
      f.facing = Math.atan2(-c.x, -c.z)
      f.group.visible = true
    }
    for (const b of this.balls) this.scene.remove(b.mesh, b.shadow)
    this.balls = []
    this.input.reset()
    this.events.onLives(MAX_LIVES, MAX_LIVES)
    this.syncMeshes()
    this.updateCamera(1)
  }

  start() {
    if (this.state === 'over') this.newRound()
    this.state = 'playing'
    this.resume()
  }

  /** Mette in pausa il loop (pagina nascosta o fuori dallo schermo). */
  pause() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.input.reset()
  }

  resume() {
    if (this.running || this.state !== 'playing') return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  private loop = (now: number) => {
    if (!this.running) return
    const dt = Math.min((now - this.last) / 1000, 1 / 30)
    this.last = now
    this.update(dt)
    this.render()
    this.raf = requestAnimationFrame(this.loop)
  }

  private buildWorld() {
    this.disposeGroup(this.world)

    const size = GRID * TILE
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color: palette.cream }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.world.add(floor)

    // Muri di neve: blocchi arrotondati in istanze, colore cobalto chiaro.
    const cells: [number, number][] = []
    for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) if (this.map.isSolid(x, z)) cells.push([x, z])
    const wallGeo = new THREE.BoxGeometry(TILE * 0.96, 1.1, TILE * 0.96)
    const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshLambertMaterial({ color: palette.ink2 }), cells.length)
    const capGeo = new THREE.BoxGeometry(TILE * 0.98, 0.18, TILE * 0.98)
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshLambertMaterial({ color: palette.snow }), cells.length)
    const m = new THREE.Matrix4()
    cells.forEach(([x, z], i) => {
      const c = GameMap.center({ x, z })
      m.makeTranslation(c.x, 0.55, c.z)
      walls.setMatrixAt(i, m)
      m.makeTranslation(c.x, 1.15, c.z)
      caps.setMatrixAt(i, m)
    })
    for (const mesh of [walls, caps]) {
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.world.add(mesh)
    }

    // Bordo dell'arena.
    const rimMat = new THREE.MeshLambertMaterial({ color: palette.navy })
    for (const [w, d, x, z] of [
      [size + 1, 0.5, 0, -HALF - 0.25], [size + 1, 0.5, 0, HALF + 0.25],
      [0.5, size, -HALF - 0.25, 0], [0.5, size, HALF + 0.25, 0],
    ]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), rimMat)
      rim.position.set(x, 0.3, z)
      rim.receiveShadow = true
      this.world.add(rim)
    }
  }

  private update(dt: number) {
    const { player, enemy } = this

    // Giocatore
    const mv = this.input.move
    const px = player.x
    const pz = player.z
    this.moveFighter(player, mv.x, mv.z, dt)
    this.playerVel = { x: (player.x - px) / dt, z: (player.z - pz) / dt }

    const aimPoint = this.input.aim && this.toWorld(this.input.aim)
    if (aimPoint) player.facing = Math.atan2(aimPoint.x - player.x, aimPoint.z - player.z)
    else if (Math.hypot(mv.x, mv.z) > 0.2) player.facing = Math.atan2(mv.x, mv.z)

    player.cooldown -= dt
    for (const tap of this.input.taps.splice(0)) {
      const p = this.toWorld(tap)
      if (!p) continue
      player.facing = Math.atan2(p.x - player.x, p.z - player.z)
      if (player.cooldown <= 0) this.throw(player, player.facing, PLAYER_FIRE_INTERVAL)
    }
    if (this.input.firing && player.cooldown <= 0) this.throw(player, player.facing, PLAYER_FIRE_INTERVAL)

    // Bot
    const intent = this.bot.think(dt, enemy, player, this.playerVel, this.balls)
    const moved = this.moveFighter(enemy, intent.mx, intent.mz, dt)
    if (!moved && (intent.mx || intent.mz)) this.bot.bump()
    enemy.facing = intent.aim
    enemy.cooldown -= dt
    if (intent.fire) this.throw(enemy, intent.aim, 0)

    for (const f of [player, enemy]) f.invulnerable = Math.max(0, f.invulnerable - dt)

    this.updateBalls(dt)
    this.updatePuffs(dt)
    this.syncMeshes()
    this.updateCamera(dt)
  }

  /** Movimento con scivolamento sui muri, asse per asse. Ritorna false se bloccato del tutto. */
  private moveFighter(f: Fighter, mx: number, mz: number, dt: number) {
    const dx = mx * f.speed * dt
    const dz = mz * f.speed * dt
    let moved = false
    if (dx && !this.map.blocked(f.x + dx, f.z, FIGHTER_RADIUS)) {
      f.x += dx
      moved = true
    }
    if (dz && !this.map.blocked(f.x, f.z + dz, FIGHTER_RADIUS)) {
      f.z += dz
      moved = true
    }
    return moved
  }

  private throw(f: Fighter, angle: number, interval: number) {
    const b = createSnowball(f, angle)
    if (this.map.isSolidAt(b.x, b.z)) return
    f.cooldown = interval
    this.balls.push(b)
    this.scene.add(b.mesh, b.shadow)
  }

  private updateBalls(dt: number) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]
      b.x += b.vx * dt
      b.z += b.vz * dt
      b.travelled += Math.hypot(b.vx, b.vz) * dt

      const target = b.owner === this.player ? this.enemy : this.player
      let gone = false
      if (Math.hypot(target.x - b.x, target.z - b.z) < FIGHTER_RADIUS + SNOWBALL_RADIUS) {
        this.puff(b.x, 0.9, b.z, 10)
        if (target.invulnerable <= 0) this.hit(target, b)
        gone = true
      } else if (this.map.isSolidAt(b.x, b.z) || b.travelled > SNOWBALL_RANGE) {
        this.puff(b.x, 0.8, b.z, 6)
        gone = true
      }

      if (gone) {
        this.scene.remove(b.mesh, b.shadow)
        this.balls.splice(i, 1)
      }
    }
  }

  private hit(target: Fighter, b: Snowball) {
    target.lives--
    target.invulnerable = INVULNERABLE_TIME
    // Piccola spinta nella direzione del tiro, se c'è spazio.
    const len = Math.hypot(b.vx, b.vz) || 1
    const kx = (b.vx / len) * KNOCKBACK
    const kz = (b.vz / len) * KNOCKBACK
    if (!this.map.blocked(target.x + kx, target.z + kz, FIGHTER_RADIUS)) {
      target.x += kx
      target.z += kz
    }
    this.events.onLives(this.player.lives, this.enemy.lives)

    if (target.lives <= 0) {
      target.group.visible = false
      this.puff(target.x, 0.8, target.z, 24)
      this.state = 'over'
      this.input.reset()
      const winner: Winner = target === this.enemy ? 'player' : 'bot'
      // Lascia finire lo sbuffo prima di fermare il loop.
      setTimeout(() => {
        if (this.destroyed) return
        if (this.state === 'over') this.pause()
        this.events.onOver(winner)
      }, 650)
    }
  }

  private puff(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.07, 6, 5), new THREE.MeshBasicMaterial({ color: palette.snow, transparent: true }))
      mesh.position.set(x, y, z)
      const a = Math.random() * Math.PI * 2
      const s = 1.5 + Math.random() * 2.5
      this.puffs.push({ mesh, vx: Math.cos(a) * s, vy: 1 + Math.random() * 3, vz: Math.sin(a) * s, life: 0.45 })
      this.scene.add(mesh)
    }
  }

  private updatePuffs(dt: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]
      p.life -= dt
      p.vy -= 12 * dt
      p.mesh.position.x += p.vx * dt
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt)
      p.mesh.position.z += p.vz * dt
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / 0.45)
      if (p.life <= 0) {
        this.scene.remove(p.mesh)
        p.mesh.geometry.dispose()
        ;(p.mesh.material as THREE.Material).dispose()
        this.puffs.splice(i, 1)
      }
    }
  }

  private syncMeshes() {
    const t = performance.now() / 1000
    for (const f of [this.player, this.enemy]) {
      f.group.position.set(f.x, 0, f.z)
      f.body.rotation.y = f.facing
      // Lampeggia mentre è invulnerabile.
      f.body.visible = f.invulnerable <= 0 || Math.floor(t * 12) % 2 === 0
    }
    for (const b of this.balls) {
      const arc = Math.sin((b.travelled / SNOWBALL_RANGE) * Math.PI) * 0.35
      b.mesh.position.set(b.x, 0.85 + arc, b.z)
      b.shadow.position.set(b.x, 0.02, b.z)
    }
  }

  /** Telecamera dall'alto e un po' inclinata; più alta sugli schermi stretti per vedere di più. */
  private updateCamera(dt: number) {
    const aspect = this.camera.aspect
    const zoom = aspect < 1 ? 1 + (1 - aspect) * 0.6 : 1
    // Segue il giocatore senza inquadrare troppo vuoto oltre il bordo dell'arena.
    const halfH = Math.hypot(30, 15) * zoom * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const halfW = halfH * aspect
    const ex = Math.max(0, HALF + 1 - halfW)
    const ez = Math.max(0, HALF + 1 - halfH)
    const tx = THREE.MathUtils.clamp(this.player.x, -ex, ex)
    const tz = THREE.MathUtils.clamp(this.player.z, -ez, ez)
    const k = 1 - Math.exp(-dt * 6)
    const target = new THREE.Vector3(tx, 30 * zoom, tz + 15 * zoom)
    this.camera.position.lerp(target, k)
    this.camera.lookAt(this.camera.position.x, 0, this.camera.position.z - 15 * zoom)
  }

  private toWorld(p: { x: number; y: number }) {
    const el = this.renderer.domElement
    const ndc = new THREE.Vector2((p.x / el.clientWidth) * 2 - 1, -(p.y / el.clientHeight) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.ground, hit) ? hit : null
  }

  private resize() {
    const w = Math.max(1, this.mount.clientWidth)
    const h = Math.max(1, this.mount.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.updateCamera(1)
    this.render()
  }

  private render() {
    this.renderer.render(this.scene, this.camera)
  }

  private disposeGroup(g: THREE.Object3D) {
    for (const child of [...g.children]) {
      child.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      g.remove(child)
    }
  }

  destroy() {
    this.destroyed = true
    this.pause()
    this.state = 'over'
    this.input.destroy()
    this.resizeObserver.disconnect()
    for (const p of this.puffs) {
      p.mesh.geometry.dispose()
      ;(p.mesh.material as THREE.Material).dispose()
    }
    for (const b of this.balls) this.scene.remove(b.mesh, b.shadow)
    this.scene.remove(...this.scene.children)
    this.disposeGroup(this.world)
    this.disposeGroup(this.player.group)
    this.disposeGroup(this.enemy.group)
    disposeShared()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
