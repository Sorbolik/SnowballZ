import { GameMap, type Cell } from './map'
import type { Fighter, Snowball } from './entities'
import { SNOWBALL_SPEED } from './entities'

// Bot di difficoltà media: ti cerca per la mappa, quando ti vede tiene una
// distanza di tiro girandoti attorno, mira con un po' di errore e ogni tanto schiva.
const VIEW_RANGE = 15
const PREFERRED_DISTANCE = 7
const REACTION = 0.4
const AIM_ERROR = 0.12 // radianti, circa 7 gradi
const LEAD = 0.5 // quanto anticipa il tuo movimento (0 = per niente, 1 = perfetto)
const FIRE_INTERVAL: [number, number] = [0.85, 1.35]
const DODGE_CHANCE = 0.35

export type BotIntent = { mx: number; mz: number; aim: number; fire: boolean }

export class Bot {
  private path: Cell[] = []
  private repath = 0
  private seenFor = 0
  private strafe = 1
  private strafeTimer = 0
  private nextShot = 1
  private dodge = { x: 0, z: 0, t: 0 }
  private judged = new WeakSet<Snowball>()

  constructor(
    private readonly map: GameMap,
    private readonly rand: () => number,
  ) {}

  /** Il movimento è finito contro un muro: cambia lato e ricalcola il percorso. */
  bump() {
    this.strafe = -this.strafe
    this.strafeTimer = 0.6 + this.rand() * 0.8
    this.repath = 0
  }

  think(dt: number, me: Fighter, target: Fighter, targetVel: { x: number; z: number }, balls: Snowball[]): BotIntent {
    const dx = target.x - me.x
    const dz = target.z - me.z
    const dist = Math.hypot(dx, dz)
    const sees = dist < VIEW_RANGE && this.map.lineOfSight(me.x, me.z, target.x, target.z)

    this.seenFor = sees ? this.seenFor + dt : 0
    this.nextShot -= dt
    this.strafeTimer -= dt
    this.repath -= dt

    let mx = 0
    let mz = 0
    let aim = Math.atan2(dx, dz)
    let fire = false

    if (sees) {
      this.path = []
      const ux = dx / (dist || 1)
      const uz = dz / (dist || 1)
      // Avvicinati o allontanati verso la distanza preferita, girando di lato.
      const radial = dist > PREFERRED_DISTANCE + 2 ? 1 : dist < PREFERRED_DISTANCE - 2 ? -1 : 0
      if (this.strafeTimer <= 0) {
        this.strafe = this.rand() < 0.5 ? -1 : 1
        this.strafeTimer = 0.8 + this.rand() * 1.4
      }
      mx = ux * radial + -uz * this.strafe * 0.8
      mz = uz * radial + ux * this.strafe * 0.8

      if (this.seenFor > REACTION && this.nextShot <= 0) {
        const t = dist / SNOWBALL_SPEED
        const lx = target.x + targetVel.x * t * LEAD
        const lz = target.z + targetVel.z * t * LEAD
        aim = Math.atan2(lx - me.x, lz - me.z) + (this.rand() * 2 - 1) * AIM_ERROR
        fire = true
        this.nextShot = FIRE_INTERVAL[0] + this.rand() * (FIRE_INTERVAL[1] - FIRE_INTERVAL[0])
      }
    } else {
      // Ti cerca seguendo un percorso sulla griglia.
      if (this.repath <= 0 || this.path.length === 0) {
        this.path = this.map.path(GameMap.cellOf(me.x, me.z), GameMap.cellOf(target.x, target.z))
        this.repath = 0.6
      }
      const next = this.path[0]
      if (next) {
        const c = GameMap.center(next)
        const ex = c.x - me.x
        const ez = c.z - me.z
        if (Math.hypot(ex, ez) < 0.3) this.path.shift()
        mx = ex
        mz = ez
        aim = Math.atan2(ex, ez)
      }
    }

    // Schivata: se una palla tua sta per prenderlo, a volte fa un passo di lato.
    this.dodge.t -= dt
    for (const b of balls) {
      if (b.owner === me || this.judged.has(b)) continue
      const rx = me.x - b.x
      const rz = me.z - b.z
      const along = (rx * b.vx + rz * b.vz) / SNOWBALL_SPEED
      if (along < 0 || along > 5) continue
      this.judged.add(b)
      const side = (rx * b.vz - rz * b.vx) / SNOWBALL_SPEED
      if (Math.abs(side) < 0.9 && this.rand() < DODGE_CHANCE) {
        const s = side >= 0 ? 1 : -1
        this.dodge = { x: (b.vz / SNOWBALL_SPEED) * s, z: (-b.vx / SNOWBALL_SPEED) * s, t: 0.35 }
      }
    }
    if (this.dodge.t > 0) {
      mx = this.dodge.x
      mz = this.dodge.z
    }

    const len = Math.hypot(mx, mz)
    if (len > 1e-3) {
      mx /= len
      mz /= len
    }
    return { mx, mz, aim, fire }
  }
}
