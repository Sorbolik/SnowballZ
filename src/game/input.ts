// Input confinato all'elemento del gioco: tastiera solo quando ha il focus,
// mouse e touch solo sul canvas. Così il gioco non ruba tasti o click al resto della pagina.
//  - Desktop: WASD/frecce per muoversi, il mouse mira, click (anche tenuto) o Spazio per tirare.
//  - Touch: joystick virtuale nella metà sinistra, tap altrove per tirare in quel punto.

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
}

const JOY_RADIUS = 48

export class Input {
  /** Movimento richiesto, lunghezza 0..1 (x verso destra, z verso il basso dello schermo). */
  move = { x: 0, z: 0 }
  /** Punto mirato in coordinate del canvas (px), null se non c'è un puntatore. */
  aim: { x: number; y: number } | null = null
  firing = false
  /** Tiri "a colpo singolo" (tap) da consumare nel prossimo frame. */
  taps: { x: number; y: number }[] = []

  private keys = new Set<string>()
  private joy: { id: number; ox: number; oy: number } | null = null
  private mouseDown = false
  private spaceDown = false
  private off: (() => void)[] = []

  constructor(
    private readonly focusTarget: HTMLElement,
    private readonly surface: HTMLElement,
    private readonly joyBase: HTMLElement,
    private readonly joyKnob: HTMLElement,
  ) {
    this.on(focusTarget, 'keydown', this.onKeyDown)
    this.on(focusTarget, 'keyup', this.onKeyUp)
    this.on(focusTarget, 'blur', this.reset)
    this.on(surface, 'pointerdown', this.onPointerDown)
    this.on(surface, 'pointermove', this.onPointerMove)
    this.on(surface, 'pointerup', this.onPointerUp)
    this.on(surface, 'pointercancel', this.onPointerUp)
    this.on(surface, 'pointerleave', this.onPointerLeave)
    this.on(surface, 'contextmenu', (e: Event) => e.preventDefault())
  }

  private on<E extends Event>(el: HTMLElement, type: string, fn: (e: E) => void) {
    const bound = fn.bind(this) as EventListener
    el.addEventListener(type, bound)
    this.off.push(() => el.removeEventListener(type, bound))
  }

  private local(e: PointerEvent) {
    const r = this.surface.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private onKeyDown(e: KeyboardEvent) {
    const tag = (e.composedPath()[0] as HTMLElement).tagName
    if (tag === 'BUTTON' || tag === 'INPUT') return
    if (e.code in MOVE_KEYS || e.code === 'Space') e.preventDefault()
    if (e.code === 'Space') this.spaceDown = true
    this.keys.add(e.code)
    this.syncKeys()
  }

  private onKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') this.spaceDown = false
    this.keys.delete(e.code)
    this.syncKeys()
  }

  private syncKeys() {
    if (this.joy) return
    let x = 0
    let z = 0
    for (const k of this.keys) {
      const v = MOVE_KEYS[k]
      if (v) {
        x += v[0]
        z += v[1]
      }
    }
    const len = Math.hypot(x, z)
    this.move = len ? { x: x / len, z: z / len } : { x: 0, z: 0 }
    this.firing = this.mouseDown || this.spaceDown
  }

  private onPointerDown(e: PointerEvent) {
    this.focusTarget.focus({ preventScroll: true })
    const p = this.local(e)
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
      this.aim = p
      this.mouseDown = true
      this.firing = true
      this.surface.setPointerCapture(e.pointerId)
      return
    }
    e.preventDefault()
    const w = this.surface.clientWidth
    if (!this.joy && p.x < w * 0.45) {
      this.joy = { id: e.pointerId, ox: p.x, oy: p.y }
      this.surface.setPointerCapture(e.pointerId)
      this.joyBase.style.transform = `translate(${p.x}px, ${p.y}px)`
      this.joyKnob.style.transform = `translate(${p.x}px, ${p.y}px)`
      this.joyBase.hidden = false
      this.joyKnob.hidden = false
    } else {
      this.taps.push(p)
    }
  }

  private onPointerMove(e: PointerEvent) {
    const p = this.local(e)
    if (e.pointerType === 'mouse') {
      this.aim = p
      return
    }
    if (this.joy && e.pointerId === this.joy.id) {
      let dx = p.x - this.joy.ox
      let dy = p.y - this.joy.oy
      const len = Math.hypot(dx, dy)
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS
        dy = (dy / len) * JOY_RADIUS
      }
      this.move = { x: dx / JOY_RADIUS, z: dy / JOY_RADIUS }
      this.joyKnob.style.transform = `translate(${this.joy.ox + dx}px, ${this.joy.oy + dy}px)`
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      this.mouseDown = false
      this.firing = this.spaceDown
      return
    }
    if (this.joy && e.pointerId === this.joy.id) {
      this.joy = null
      this.move = { x: 0, z: 0 }
      this.joyBase.hidden = true
      this.joyKnob.hidden = true
    }
  }

  private onPointerLeave(e: PointerEvent) {
    if (e.pointerType === 'mouse' && !this.mouseDown) this.aim = null
  }

  reset() {
    this.keys.clear()
    this.joy = null
    this.mouseDown = false
    this.spaceDown = false
    this.firing = false
    this.move = { x: 0, z: 0 }
    this.taps = []
    this.joyBase.hidden = true
    this.joyKnob.hidden = true
  }

  destroy() {
    this.off.forEach((f) => f())
    this.off = []
  }
}
