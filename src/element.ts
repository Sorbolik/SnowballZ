import { Game, type Winner } from './game/Game'
import { MAX_LIVES } from './game/entities'
import { createRoom, RoomLink, type RoomMsg } from './net'

// <snowballz-demo>: il micro-frontend. Riempie il suo contenitore, tiene stili e input
// nello shadow DOM e si smonta da solo quando viene rimosso dalla pagina.
// Colori e font si possono sovrascrivere dall'host con le custom property --sbz-*.
//
// Eventi: "snowballz:over" con detail { winner: 'player' | 'bot' | 'opponent' }.
//
// Di default si gioca contro il bot e l'online si propone dopo una vittoria (così nel portfolio).
// Online: "Crea stanza" dà un codice da passare all'altro giocatore, che lo scrive in "Entra".
// Attributi:
//   menu             la prima schermata fa scegliere tra bot e amico (la pagina del gioco)
//   room="CODICE"    entra subito in quella stanza
//   server="https://…"  server delle stanze; di default lo stesso indirizzo di snowballz.js

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
button.ghost { background: transparent; color: var(--sbz-cream); box-shadow: inset 0 0 0 2px var(--sbz-cream); }
button.ghost:hover { background: var(--sbz-cream); color: var(--sbz-ink); }
button:disabled { opacity: 0.5; cursor: default; }
.row { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px; }
.join { display: flex; gap: 8px; }
.join input {
  width: 10.5ch; font: inherit; font-family: var(--sbz-mono, ui-monospace, monospace);
  font-size: 1rem; letter-spacing: 0.2em; text-transform: uppercase; text-align: center;
  color: var(--sbz-cream); background: var(--sbz-ink); border: 2px solid var(--sbz-cream);
  border-radius: 999px; padding: 10px 14px;
}
.join input::placeholder { color: var(--sbz-cream); opacity: 0.5; }
.join input:focus-visible { outline: 2px solid var(--sbz-cream); outline-offset: 3px; }
h2.small { font-size: clamp(1.6rem, 5vw, 2.4rem); }
button.link { background: none; color: var(--sbz-cream); padding: 6px 10px; font-weight: 500; text-decoration: underline; text-underline-offset: 3px; }
button.link:hover { background: none; color: var(--sbz-cream); opacity: 0.8; }
.code {
  font-family: var(--sbz-mono, ui-monospace, monospace); font-weight: 700;
  font-size: clamp(2rem, 8vw, 3.25rem); letter-spacing: 0.18em;
  background: var(--sbz-cream); color: var(--sbz-ink); padding: 4px 6px 4px 18px; border-radius: 12px;
}
.error { color: var(--sbz-cream); background: var(--sbz-red); padding: 4px 12px; border-radius: 999px; font-size: 0.9rem; opacity: 1; }
.error:empty { display: none; }
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
  <div class="side"><span class="pips" data-pips="bot"></span><span class="label" data-other>Bot</span></div>
</div>
<div class="joy base" hidden></div>
<div class="joy knob" hidden></div>
<div class="overlay" data-screen="intro">
  <h2>SnowballZ</h2>
  <p data-intro-text>Battaglia a palle di neve contro un bot. Tre colpi e sei fuori.</p>
  <p class="keys mouse-only">WASD / frecce per muoverti · mouse per mirare · click o spazio per tirare</p>
  <p class="keys touch-only">Pollice a sinistra per muoverti · tocca un punto per tirare lì</p>
  <div class="row">
    <button type="button" data-action="play">Gioca</button>
    <button type="button" class="ghost" data-action="online" data-menu-only hidden>Contro un amico</button>
  </div>
</div>
<div class="overlay" data-screen="online" hidden>
  <h2 class="small">Contro un amico</h2>
  <p>Crea una stanza e passa il codice, oppure entra con quello che ti hanno dato.</p>
  <div class="row">
    <button type="button" data-action="host">Crea stanza</button>
    <form class="join" data-join>
      <input name="code" maxlength="5" placeholder="CODICE" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Codice della stanza" />
      <button type="submit" class="ghost">Entra</button>
    </form>
  </div>
  <p class="error" role="alert" data-error></p>
  <button type="button" class="link" data-action="back">Indietro</button>
</div>
<div class="overlay" data-screen="room" hidden>
  <p data-room-text></p>
  <span class="code" data-code></span>
  <div class="row">
    <button type="button" data-action="share">Copia link</button>
    <button type="button" class="ghost" data-action="leave">Annulla</button>
  </div>
</div>
<div class="overlay" data-screen="over" hidden>
  <h2 data-title></h2>
  <p data-text></p>
  <div class="row">
    <button type="button" data-action="again">Rivincita</button>
    <button type="button" class="ghost" data-action="online" data-after-win hidden>Sfida un amico</button>
    <button type="button" class="ghost" data-action="leave" data-online-only>Esci</button>
  </div>
</div>
<div role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)" data-live></div>
`

export class SnowballzDemo extends HTMLElement {
  private game: Game | null = null
  private room: RoomLink | null = null
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
    this.setAttribute('aria-label', 'SnowballZ, gioco a palle di neve contro un bot o online')

    const $ = <T extends Element = HTMLElement>(sel: string) => this.root.querySelector<T>(sel)!
    const live = $('[data-live]')

    const pips = (who: 'player' | 'bot', n: number) => {
      $(`[data-pips="${who}"]`).innerHTML = Array.from(
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
        const vs = this.room ? 'L\'altro giocatore' : 'Il bot'
        $('[data-title]').textContent = won ? 'Hai vinto!' : 'Colpito e affondato'
        $('[data-text]').textContent = won
          ? this.room ? 'L\'altro giocatore è sotto la neve. Un\'altra?' : 'Il bot è sotto la neve. Troppo facile? Sfida un amico online.'
          : `${vs} ha avuto la mira migliore. Ci riprovi?`
        live.textContent = won ? 'Hai vinto' : 'Hai perso'
        this.show('over')
        $('[data-after-win]').hidden = !won || !!this.room
        $<HTMLButtonElement>('[data-action="again"]').focus({ preventScroll: true })
        this.dispatchEvent(new CustomEvent('snowballz:over', { detail: { winner }, bubbles: true, composed: true }))
      },
    })

    this.on('play', () => this.playBot())
    this.on('again', () => {
      if (!this.room) return this.playBot()
      this.room.send({ t: 'again' })
      $<HTMLButtonElement>('[data-action="again"]').disabled = true
      $('[data-text]').textContent = 'Aspetto che anche l\'altro giocatore voglia la rivincita…'
    })
    this.on('host', async (btn) => {
      btn.disabled = true
      try {
        this.joinRoom(await createRoom(this.server))
      } catch {
        this.fail('Non riesco a creare la stanza, riprova tra poco.')
      } finally {
        btn.disabled = false
      }
    })
    this.on('share', (btn) => this.share(btn))
    this.on('leave', () => this.leaveRoom())
    this.on('online', () => {
      this.leaveRoom(false)
      this.show('online')
      $<HTMLInputElement>('[data-join] input').focus({ preventScroll: true })
    })
    this.on('back', () => this.show('intro'))

    if (this.hasAttribute('menu')) {
      $('[data-intro-text]').textContent = 'Battaglia a palle di neve, contro il bot o contro un amico. Tre colpi e sei fuori.'
      $('[data-action="play"]').textContent = 'Contro il bot'
      $('[data-menu-only]').hidden = false
    }

    const form = $<HTMLFormElement>('[data-join]')
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const code = form.code.value.trim().toUpperCase()
      if (code.length !== 5) return this.fail('Il codice ha 5 caratteri.')
      this.joinRoom(code)
    })

    // Niente rendering quando il gioco è fuori dallo schermo o la scheda è nascosta.
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting
      this.syncRunning()
    })
    this.observer.observe(this)
    document.addEventListener('visibilitychange', this.syncRunning)

    const room = this.getAttribute('room')
    if (room) this.joinRoom(room.toUpperCase())
  }

  private get server() {
    return (this.getAttribute('server') ?? (import.meta.env.DEV ? 'http://localhost:8787' : new URL(import.meta.url).origin)).replace(/\/$/, '')
  }

  private on(action: string, fn: (btn: HTMLButtonElement) => void) {
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>(`[data-action="${action}"]`)) {
      btn.addEventListener('click', () => fn(btn))
    }
  }

  private show(screen: 'intro' | 'online' | 'room' | 'over' | null) {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) el.hidden = el.dataset.screen !== screen
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-online-only]')) el.hidden = !this.room
    this.root.querySelector<HTMLElement>('[data-after-win]')!.hidden = true
    this.root.querySelector<HTMLButtonElement>('[data-action="again"]')!.disabled = false
    this.root.querySelector('[data-other]')!.textContent = this.room ? 'Rivale' : 'Bot'
  }

  private fail(message: string) {
    this.show('online')
    this.root.querySelector('[data-error]')!.textContent = message
  }

  private begin(text: string) {
    this.show(null)
    this.root.querySelector('[data-error]')!.textContent = ''
    this.root.querySelector('[data-live]')!.textContent = text
    this.focus({ preventScroll: true })
    if (!this.visible || document.hidden) this.game?.pause()
  }

  private playBot() {
    this.leaveRoom(false)
    this.begin('Partita iniziata')
    this.game?.start()
    if (!this.visible || document.hidden) this.game?.pause()
  }

  private joinRoom(code: string) {
    this.leaveRoom(false)
    const $ = (sel: string) => this.root.querySelector<HTMLElement>(sel)!
    $('[data-code]').textContent = code
    $('[data-room-text]').textContent = 'Mi collego alla stanza…'
    this.room = new RoomLink(this.server, code, (m) => this.onRoom(m), () => {
      if (!this.room) return
      this.room = null
      this.game?.stop()
      this.fail('Connessione persa con la stanza.')
    })
    this.show('room')
  }

  private onRoom(m: RoomMsg) {
    const $ = (sel: string) => this.root.querySelector<HTMLElement>(sel)!
    switch (m.t) {
      case 'hello':
        $('[data-room-text]').textContent = m.slot === 0
          ? 'Stanza creata. Manda il codice o il link a chi vuoi sfidare: si parte appena entra.'
          : 'Sei dentro, si parte…'
        break
      case 'start':
        this.begin('Partita online iniziata')
        this.game?.startOnline(m.seed, m.slot, (msg) => this.room?.send(msg))
        if (!this.visible || document.hidden) this.game?.pause()
        break
      case 'again':
        if (!$('[data-screen="over"]').hidden) $('[data-text]').textContent = 'L\'altro giocatore vuole la rivincita!'
        break
      case 'left':
        this.game?.stop()
        $('[data-code]').textContent = this.room?.code ?? ''
        $('[data-room-text]').textContent = 'L\'altro giocatore è uscito. Puoi aspettare che rientri con lo stesso codice.'
        this.show('room')
        break
      case 'error':
        this.room?.close()
        this.room = null
        this.fail(m.error === 'full' ? 'Quella stanza è già piena.' : 'Stanza non trovata: controlla il codice.')
        break
      default:
        this.game?.receive(m)
    }
  }

  private leaveRoom(toMenu = true) {
    if (this.room) {
      this.room.close()
      this.room = null
      this.game?.stop()
    }
    if (toMenu) this.show('online')
  }

  private async share(btn: HTMLButtonElement) {
    if (!this.room) return
    const url = `${this.server}/?room=${this.room.code}`
    const text = 'Sfidami a SnowballZ'
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) return await navigator.share({ title: text, url })
      await navigator.clipboard.writeText(url)
      btn.textContent = 'Link copiato'
    } catch {
      btn.textContent = url
    }
    setTimeout(() => (btn.textContent = 'Copia link'), 2500)
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
    this.leaveRoom(false)
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
