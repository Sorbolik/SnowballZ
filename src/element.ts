import { Game, type Winner } from './game/Game'
import { MAX_LIVES } from './game/entities'

// <snowballz-demo>: il micro-frontend. Riempie il suo contenitore, tiene stili e input
// nello shadow DOM e si smonta da solo quando viene rimosso dalla pagina.
// Colori e font si possono sovrascrivere dall'host con le custom property --sbz-*.
//
// Eventi: "snowballz:over" con detail { winner: 'player' | 'bot' }.

const css = /* css */ `
:host {
  --sbz-ink: #0b2470;
  --sbz-ink-2: #14358f;
  --sbz-cream: #f6e6a3;
  --sbz-red: #d52c30;
  display: block;
  position: relative;
  overflow: hidden;
  min-height: 240px;
  background: var(--sbz-ink);
  color: var(--sbz-cream);
  font-family: var(--sbz-font, inherit);
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}
:host(:focus-visible) { box-shadow: inset 0 0 0 3px var(--sbz-cream); }
.stage { position: absolute; inset: 0; }
.hud {
  position: absolute; inset: 0 0 auto 0;
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px; pointer-events: none;
}
.side { display: flex; align-items: center; gap: 8px; }
.label {
  font-family: var(--sbz-mono, ui-monospace, monospace);
  font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  background: var(--sbz-ink); padding: 4px 10px; border-radius: 999px;
}
.pips { display: flex; gap: 5px; background: var(--sbz-ink); padding: 6px 9px; border-radius: 999px; }
.pip {
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--sbz-red);
  transition: transform 200ms ease, opacity 200ms ease;
}
.pip.bot { background: var(--sbz-cream); }
.pip.lost { opacity: 0.25; transform: scale(0.7); }
.overlay {
  position: absolute; inset: 0;
  display: grid; place-content: center; justify-items: center; gap: 14px;
  padding: 24px; text-align: center;
  background: color-mix(in srgb, var(--sbz-ink) 72%, transparent);
}
.overlay[hidden] { display: none; }
h2 { margin: 0; font-size: clamp(2rem, 7vw, 3.5rem); font-weight: 800; letter-spacing: -0.035em; line-height: 0.95; }
p { margin: 0; max-width: 32ch; line-height: 1.5; opacity: 0.85; }
button {
  font: inherit; font-weight: 600; font-size: 1rem;
  color: var(--sbz-ink); background: var(--sbz-cream);
  border: 0; border-radius: 999px; padding: 12px 26px; cursor: pointer;
  transition: background 160ms ease, color 160ms ease, transform 160ms ease;
}
button:hover { background: var(--sbz-red); color: var(--sbz-cream); }
button:active { transform: scale(0.97); }
button:focus-visible { outline: 2px solid var(--sbz-cream); outline-offset: 3px; }
.keys { font-family: var(--sbz-mono, ui-monospace, monospace); font-size: 12px; letter-spacing: 0.06em; opacity: 0.75; }
.touch-only { display: none; }
@media (pointer: coarse) { .touch-only { display: block; } .mouse-only { display: none; } }
.joy {
  position: absolute; left: 0; top: 0; pointer-events: none; border-radius: 50%;
}
.joy[hidden] { display: none; }
.joy.base { width: 112px; height: 112px; margin: -56px 0 0 -56px; border: 3px solid var(--sbz-ink); opacity: 0.35; }
.joy.knob { width: 48px; height: 48px; margin: -24px 0 0 -24px; background: var(--sbz-ink); box-shadow: 0 0 0 3px var(--sbz-cream); opacity: 0.75; }
`

const template = /* html */ `
<style>${css}</style>
<div class="stage" part="stage"></div>
<div class="hud" aria-hidden="true">
  <div class="side"><span class="label">Tu</span><span class="pips" data-pips="player"></span></div>
  <div class="side"><span class="pips" data-pips="bot"></span><span class="label">Bot</span></div>
</div>
<div class="joy base" hidden></div>
<div class="joy knob" hidden></div>
<div class="overlay" data-screen="intro">
  <h2>SnowballZ</h2>
  <p>Battaglia a palle di neve contro un bot. Tre colpi e sei fuori.</p>
  <p class="keys mouse-only">WASD / frecce per muoverti · mouse per mirare · click o spazio per tirare</p>
  <p class="keys touch-only">Pollice a sinistra per muoverti · tocca un punto per tirare lì</p>
  <button type="button" data-action="play">Gioca</button>
</div>
<div class="overlay" data-screen="over" hidden>
  <h2 data-title></h2>
  <p data-text></p>
  <button type="button" data-action="play">Rivincita</button>
</div>
<div role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)" data-live></div>
`

export class SnowballzDemo extends HTMLElement {
  private game: Game | null = null
  private visible = true
  private observer: IntersectionObserver | null = null
  private root: ShadowRoot

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    if (this.game) return
    this.root.innerHTML = template
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.setAttribute('role', 'application')
    this.setAttribute('aria-label', 'SnowballZ, gioco a palle di neve contro un bot')

    const $ = <T extends Element>(sel: string) => this.root.querySelector<T>(sel)!
    const intro = $<HTMLElement>('[data-screen="intro"]')
    const over = $<HTMLElement>('[data-screen="over"]')
    const live = $<HTMLElement>('[data-live]')

    const pips = (who: 'player' | 'bot', n: number) => {
      $<HTMLElement>(`[data-pips="${who}"]`).innerHTML = Array.from(
        { length: MAX_LIVES },
        (_, i) => `<span class="pip ${who === 'bot' ? 'bot' : ''} ${i < n ? '' : 'lost'}"></span>`,
      ).join('')
    }

    this.game = new Game($('.stage'), this, $('.joy.base'), $('.joy.knob'), {
      onLives: (p, b) => {
        pips('player', p)
        pips('bot', b)
      },
      onOver: (winner: Winner) => {
        const won = winner === 'player'
        $('[data-title]').textContent = won ? 'Hai vinto!' : 'Colpito e affondato'
        $('[data-text]').textContent = won ? 'Il bot è sotto la neve. Un\'altra?' : 'Il bot ha avuto la mira migliore. Ci riprovi?'
        live.textContent = won ? 'Hai vinto' : 'Hai perso'
        over.hidden = false
        $<HTMLButtonElement>('[data-screen="over"] button').focus({ preventScroll: true })
        this.dispatchEvent(new CustomEvent('snowballz:over', { detail: { winner }, bubbles: true, composed: true }))
      },
    })

    for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-action="play"]')) {
      btn.addEventListener('click', () => {
        intro.hidden = true
        over.hidden = true
        live.textContent = 'Partita iniziata'
        this.focus({ preventScroll: true })
        this.game?.start()
        if (!this.visible || document.hidden) this.game?.pause()
      })
    }

    // Niente rendering quando il gioco è fuori dallo schermo o la scheda è nascosta.
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting
      this.syncRunning()
    })
    this.observer.observe(this)
    document.addEventListener('visibilitychange', this.syncRunning)
  }

  private syncRunning = () => {
    if (!this.game) return
    if (this.visible && !document.hidden) this.game.resume()
    else this.game.pause()
  }

  disconnectedCallback() {
    this.observer?.disconnect()
    this.observer = null
    document.removeEventListener('visibilitychange', this.syncRunning)
    this.game?.destroy()
    this.game = null
    this.root.innerHTML = ''
  }
}

if (!customElements.get('snowballz-demo')) customElements.define('snowballz-demo', SnowballzDemo)

declare global {
  interface HTMLElementTagNameMap {
    'snowballz-demo': SnowballzDemo
  }
}
