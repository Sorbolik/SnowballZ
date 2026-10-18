# SnowballZ

Battaglia a palle di neve in three.js, contro un bot.

Questo branch (`single-player-demo`) è la riscrittura pensata per girare come micro-frontend
dentro il portfolio: contro il bot, e (in arrivo) online in 2 con le stanze. Il multiplayer originale
(Express + socket.io) resta su `main`.

## Come si usa

Il build produce `dist/snowballz.js`, un modulo ES che registra il custom element `<snowballz-demo>`:

```html
<script type="module" src="https://<deploy>/snowballz.js"></script>
<snowballz-demo style="display:block; height: 70vh"></snowballz-demo>
```

oppure, caricandolo solo quando serve:

```js
await import('https://<deploy>/snowballz.js')
container.append(document.createElement('snowballz-demo'))
```

- Riempie il contenitore e si ridimensiona con lui.
- Stili e input stanno nello shadow DOM: la tastiera funziona solo quando il gioco ha il focus.
- Quando l'elemento viene rimosso dalla pagina libera WebGL, listener e memoria.
- Si mette in pausa da solo quando esce dallo schermo o la scheda è nascosta.
- Colori sovrascrivibili dall'host: `--sbz-ink`, `--sbz-ink-2`, `--sbz-cream`, `--sbz-red`, `--sbz-font`, `--sbz-mono`.
- Evento `snowballz:over` con `detail.winner` (`'player'` o `'bot'`).

## Controlli

- Desktop: WASD o frecce per muoversi, il mouse mira, click (anche tenuto) o Spazio per tirare.
- Touch: pollice nella metà sinistra per il joystick, tocca un punto per tirare lì.

## Sviluppo

```bash
npm install
npm run dev       # pagina standalone su http://localhost:5175
npm run build     # dist/ (index.html standalone + snowballz.js)
npm run preview   # serve dist/ su http://localhost:4174, con CORS, per provarlo dentro il portfolio
```

## Struttura

- `src/element.ts`: il custom element (shadow DOM, HUD, schermate, pausa automatica).
- `src/game/Game.ts`: scena three.js, loop, collisioni, colpi.
- `src/game/bot.ts`: il bot (ti cerca con BFS sulla griglia, gira attorno, mira con errore, a volte schiva).
- `src/game/map.ts`: mappa a griglia generata da un seed, linea di vista, percorsi.
- `src/game/input.ts`: tastiera, mouse e joystick virtuale.
- `server/worker.ts`: il server online (Worker + Durable Object per stanza).

## Online

Il server sta nello stesso Worker che serve `snowballz.js`: una stanza è un Durable Object
che tiene i due WebSocket e inoltra all'altro giocatore i messaggi di uno. La partita la
simulano i client; il server sceglie il seed della mappa e chi parte da quale angolo.

- `POST /api/rooms` → `{ "code": "K7QWD" }` (5 caratteri, niente 0/O/1/I/L)
- `GET /api/rooms/:code` con `Upgrade: websocket` → la stanza

Messaggi dal server (JSON):

- `{ t: 'hello', slot }`: sei entrato, `slot` 0 (chi crea) o 1
- `{ t: 'start', seed, slot }`: siete in due, si parte con la mappa di quel `seed`
- `{ t: 'left' }`: l'altro è uscito
- `{ t: 'error', error: 'missing' | 'full' }`: codice sbagliato o stanza piena, poi chiude

Dal client: qualsiasi JSON (max 1 kB) viene girato all'altro così com'è; `{"t":"again"}`
chiede la rivincita, che riparte quando la chiedono entrambi. `ping` → `pong` per tenere
viva la connessione. Una stanza vuota sparisce dopo un'ora.

```bash
npm run build && npx wrangler dev   # sito + server su http://localhost:8787
```

## Deploy

Cloudflare Workers (`wrangler.jsonc`): file statici da `dist/`, e `/api/*` al server.
`public/_headers` aggiunge CORS (il portfolio carica il modulo da un altro dominio) e la cache.
