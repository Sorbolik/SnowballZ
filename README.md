# SnowballZ

Battaglia a palle di neve in three.js, contro un bot.

Questo branch (`single-player-demo`) è la riscrittura single-player pensata per girare come
micro-frontend dentro il portfolio. Il multiplayer originale (Express + socket.io, stanze a 2 giocatori)
resta su `main`.

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

## Deploy

Sito statico su Cloudflare Workers (`wrangler.jsonc`). `public/_headers` aggiunge CORS
(il portfolio carica il modulo da un altro dominio) e la cache.
