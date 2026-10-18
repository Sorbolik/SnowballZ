// Collegamento a una stanza online (vedi server/worker.ts e il README per il protocollo).

export type PeerMsg =
  | { t: 's'; x: number; z: number; f: number } // posizione e mira
  | { t: 'b'; x: number; z: number; a: number } // tiro
  | { t: 'hit'; lives: number } // chi è stato colpito comunica le vite rimaste

export type RoomMsg =
  | PeerMsg
  | { t: 'hello'; slot: 0 | 1 }
  | { t: 'start'; seed: number; slot: 0 | 1 }
  | { t: 'again' }
  | { t: 'left' }
  | { t: 'error'; error: 'missing' | 'full' }

export async function createRoom(server: string): Promise<string> {
  const res = await fetch(`${server}/api/rooms`, { method: 'POST' })
  if (!res.ok) throw new Error(`create room: ${res.status}`)
  return ((await res.json()) as { code: string }).code
}

export class RoomLink {
  private ws: WebSocket
  private ping = 0

  constructor(
    server: string,
    readonly code: string,
    onMessage: (m: RoomMsg) => void,
    onClose: () => void,
  ) {
    this.ws = new WebSocket(`${server.replace(/^http/, 'ws')}/api/rooms/${encodeURIComponent(code)}`)
    this.ws.onmessage = (e) => {
      if (e.data === 'pong') return
      try {
        onMessage(JSON.parse(e.data))
      } catch {
        // messaggio non valido dall'altro client: si ignora
      }
    }
    this.ws.onclose = () => {
      clearInterval(this.ping)
      onClose()
    }
    // Tiene viva la connessione dietro proxy e reti mobili.
    this.ping = window.setInterval(() => this.ws.readyState === WebSocket.OPEN && this.ws.send('ping'), 20000)
  }

  send(m: PeerMsg | { t: 'again' }) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m))
  }

  close() {
    clearInterval(this.ping)
    this.ws.onclose = null
    this.ws.close()
  }
}
