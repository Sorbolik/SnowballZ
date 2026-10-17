// La mappa è una griglia di celle libere o piene (muri di neve).
// Generata nel client da un seed: niente più server.

export const GRID = 20
export const TILE = 2
export const HALF = (GRID * TILE) / 2

export type Cell = { x: number; z: number }

/** PRNG piccolo e deterministico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class GameMap {
  readonly solid: Uint8Array
  readonly playerSpawn: Cell = { x: 2, z: GRID - 3 }
  readonly botSpawn: Cell = { x: GRID - 3, z: 2 }

  constructor(seed: number, density = 0.14) {
    const rand = rng(seed)
    this.solid = new Uint8Array(GRID * GRID)

    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        if (rand() < density) this.solid[x + z * GRID] = 1
      }
    }
    // Spazio libero attorno ai due punti di partenza.
    for (const s of [this.playerSpawn, this.botSpawn]) {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) this.set(s.x + dx, s.z + dz, 0)
    }
    // Le sacche irraggiungibili diventano muro, così il bot trova sempre una strada.
    const reach = this.reachable(this.playerSpawn)
    for (let i = 0; i < this.solid.length; i++) if (!reach[i]) this.solid[i] = 1
  }

  private set(x: number, z: number, v: number) {
    if (x >= 0 && z >= 0 && x < GRID && z < GRID) this.solid[x + z * GRID] = v
  }

  /** Fuori dalla griglia conta come muro. */
  isSolid(x: number, z: number) {
    if (x < 0 || z < 0 || x >= GRID || z >= GRID) return true
    return this.solid[x + z * GRID] === 1
  }

  static cellOf(wx: number, wz: number): Cell {
    return { x: Math.floor((wx + HALF) / TILE), z: Math.floor((wz + HALF) / TILE) }
  }

  static center(c: Cell) {
    return { x: c.x * TILE - HALF + TILE / 2, z: c.z * TILE - HALF + TILE / 2 }
  }

  isSolidAt(wx: number, wz: number) {
    const c = GameMap.cellOf(wx, wz)
    return this.isSolid(c.x, c.z)
  }

  /** Un quadrato di lato 2*r centrato in (wx, wz) tocca un muro? */
  blocked(wx: number, wz: number, r: number) {
    const a = GameMap.cellOf(wx - r, wz - r)
    const b = GameMap.cellOf(wx + r, wz + r)
    for (let x = a.x; x <= b.x; x++) for (let z = a.z; z <= b.z; z++) if (this.isSolid(x, z)) return true
    return false
  }

  /** Linea di vista campionata lungo il segmento. */
  lineOfSight(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax
    const dz = bz - az
    const steps = Math.ceil(Math.hypot(dx, dz) / 0.25)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.isSolidAt(ax + dx * t, az + dz * t)) return false
    }
    return true
  }

  private reachable(from: Cell) {
    const seen = new Uint8Array(GRID * GRID)
    const queue = [from]
    seen[from.x + from.z * GRID] = 1
    while (queue.length) {
      const c = queue.shift()!
      for (const n of this.neighbours(c)) {
        const i = n.x + n.z * GRID
        if (!seen[i]) {
          seen[i] = 1
          queue.push(n)
        }
      }
    }
    return seen
  }

  private neighbours(c: Cell) {
    const out: Cell[] = []
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, z: c.z + dz }
      if (!this.isSolid(n.x, n.z)) out.push(n)
    }
    return out
  }

  /** Percorso BFS da una cella all'altra (esclusa la partenza). Vuoto se già arrivati. */
  path(from: Cell, to: Cell): Cell[] {
    if (from.x === to.x && from.z === to.z) return []
    const prev = new Int32Array(GRID * GRID).fill(-1)
    const start = from.x + from.z * GRID
    const goal = to.x + to.z * GRID
    prev[start] = start
    const queue = [from]
    while (queue.length) {
      const c = queue.shift()!
      if (c.x + c.z * GRID === goal) break
      for (const n of this.neighbours(c)) {
        const i = n.x + n.z * GRID
        if (prev[i] === -1) {
          prev[i] = c.x + c.z * GRID
          queue.push(n)
        }
      }
    }
    if (prev[goal] === -1) return []
    const out: Cell[] = []
    for (let i = goal; i !== start; i = prev[i]) out.push({ x: i % GRID, z: Math.floor(i / GRID) })
    return out.reverse()
  }
}
