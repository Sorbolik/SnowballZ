import * as THREE from 'three'
import { palette } from './palette'

export const FIGHTER_RADIUS = 0.5
export const MAX_LIVES = 3

export type Fighter = {
  group: THREE.Group
  /** Parte che ruota verso la mira (corpo + braccio). */
  body: THREE.Group
  x: number
  z: number
  /** Angolo di mira sul piano, 0 = verso +z. */
  facing: number
  lives: number
  invulnerable: number
  cooldown: number
  speed: number
}

/** Un pupazzo tondo: corpo a capsula, testa, sciarpa e un braccio che indica la mira. */
export function createFighter(bodyColor: number, scarfColor: number, speed: number): Fighter {
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)
  body.scale.setScalar(1.25)

  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.35, 6, 14), bodyMat)
  torso.position.y = 0.62
  torso.castShadow = true
  body.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshLambertMaterial({ color: palette.cream }))
  head.position.y = 1.32
  head.castShadow = true
  body.add(head)

  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 20), new THREE.MeshLambertMaterial({ color: scarfColor }))
  scarf.rotation.x = Math.PI / 2
  scarf.position.y = 1.08
  body.add(scarf)

  // Occhi verso la direzione di mira.
  const eyeMat = new THREE.MeshBasicMaterial({ color: palette.ink })
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat)
    eye.position.set(side * 0.11, 1.38, 0.26)
    body.add(eye)
  }

  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 8), bodyMat)
  arm.rotation.x = Math.PI / 2
  arm.position.set(0.38, 0.75, 0.32)
  arm.castShadow = true
  body.add(arm)

  return { group, body, x: 0, z: 0, facing: 0, lives: MAX_LIVES, invulnerable: 0, cooldown: 0, speed }
}

export type Snowball = {
  mesh: THREE.Mesh
  shadow: THREE.Mesh
  x: number
  z: number
  vx: number
  vz: number
  travelled: number
  owner: Fighter
}

export const SNOWBALL_SPEED = 15
export const SNOWBALL_RANGE = 22
export const SNOWBALL_RADIUS = 0.18

const ballGeo = new THREE.SphereGeometry(SNOWBALL_RADIUS, 12, 10)
const ballMat = new THREE.MeshLambertMaterial({ color: palette.snow, emissive: 0x333333 })
const shadowGeo = new THREE.CircleGeometry(SNOWBALL_RADIUS * 1.1, 12)
const shadowMat = new THREE.MeshBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.18, depthWrite: false })

export function createSnowball(owner: Fighter, angle: number): Snowball {
  const mesh = new THREE.Mesh(ballGeo, ballMat)
  const shadow = new THREE.Mesh(shadowGeo, shadowMat)
  shadow.rotation.x = -Math.PI / 2
  const dx = Math.sin(angle)
  const dz = Math.cos(angle)
  // Parte dalla mano, appena davanti al corpo.
  const x = owner.x + dx * 0.7
  const z = owner.z + dz * 0.7
  return { mesh, shadow, x, z, vx: dx * SNOWBALL_SPEED, vz: dz * SNOWBALL_SPEED, travelled: 0, owner }
}

export function disposeShared() {
  ballGeo.dispose()
  ballMat.dispose()
  shadowGeo.dispose()
  shadowMat.dispose()
}
