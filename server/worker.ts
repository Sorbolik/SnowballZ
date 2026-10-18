// Il server del gioco online: gira nello stesso Worker che serve snowballz.js.
//
// POST /api/rooms          crea una stanza e risponde { code }
// GET  /api/rooms/:code    WebSocket verso la stanza (Upgrade: websocket)
//
// Ogni stanza è un Durable Object: tiene i due WebSocket e inoltra all'altro
// giocatore quello che manda uno dei due. La partita la simulano i client;
// il server sceglie solo il seed della mappa e chi parte da quale angolo.
import { DurableObject } from 'cloudflare:workers'

type Env = { ROOMS: DurableObjectNamespace<Room> }

// Niente lettere o cifre che si confondono (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 5
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`)
const MAX_MESSAGE = 1024
const ROOM_TTL = 60 * 60 * 1000 // una stanza vuota sparisce dopo un'ora

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } })

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let i = 0; i < 5; i++) {
        const code = newCode()
        if (await env.ROOMS.getByName(code).create()) return json({ code })
      }
      return json({ error: 'busy' }, 503)
    }

    const m = url.pathname.match(/^\/api\/rooms\/([^/]+)$/)
    if (m) {
      const code = m[1].toUpperCase()
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket only' }, 426)
      if (!CODE_RE.test(code)) return json({ error: 'missing' }, 404)
      return env.ROOMS.getByName(code).fetch(request)
    }

    return json({ error: 'not found' }, 404)
  },
} satisfies ExportedHandler<Env>

type Seat = { slot: 0 | 1; again: boolean }

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Il client può fare ping per tenere viva la connessione senza svegliare l'oggetto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /** false se il codice è già in uso. */
  async create() {
    if (await this.ctx.storage.get('created')) return false
    await this.ctx.storage.put('created', true)
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL)
    return true
  }

  async fetch(): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    const others = this.players()
    const taken = others.map((ws) => this.seat(ws)?.slot)

    // Si accetta sempre, così il browser riceve il motivo prima della chiusura.
    const error = !(await this.ctx.storage.get('created')) ? 'missing' : others.length >= 2 ? 'full' : null
    this.ctx.acceptWebSocket(server, [error ? 'rejected' : 'player'])
    if (error) {
      server.send(JSON.stringify({ t: 'error', error }))
      server.close(4000, error)
      return new Response(null, { status: 101, webSocket: client })
    }

    const slot: 0 | 1 = taken.includes(0) ? 1 : 0
    server.serializeAttachment({ slot, again: false } satisfies Seat)
    server.send(JSON.stringify({ t: 'hello', slot }))
    if (others.length === 1) this.start()
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return
    if (!this.seat(ws)) return
    const other = this.players().find((s) => s !== ws)

    // "again": rivincita, riparte quando la chiedono entrambi.
    if (message === '{"t":"again"}') {
      ws.serializeAttachment({ ...this.seat(ws)!, again: true })
      if (other && this.seat(other)?.again) this.start()
      else other?.send(message)
      return
    }
    other?.send(message)
  }

  async webSocketClose(ws: WebSocket) {
    if (!this.seat(ws)) return
    for (const s of this.players()) if (s !== ws) s.send(JSON.stringify({ t: 'left' }))
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws)
  }

  async alarm() {
    if (this.players().length) await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL)
    else await this.ctx.storage.deleteAll()
  }

  private start() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    for (const ws of this.players()) {
      const seat = this.seat(ws)!
      ws.serializeAttachment({ ...seat, again: false })
      ws.send(JSON.stringify({ t: 'start', seed, slot: seat.slot }))
    }
  }

  private players() {
    return this.ctx.getWebSockets('player')
  }

  /** null per le connessioni rifiutate (stanza piena o inesistente). */
  private seat(ws: WebSocket): Seat | null {
    return ws.deserializeAttachment() as Seat | null
  }
}
