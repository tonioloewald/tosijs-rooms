/**
 * A connection to one room: join, send, hear, leave.
 *
 * Relay-only: your game runs on each player's machine, and the host passes
 * each message to the room's other members, labelled with who sent it. The
 * host checks membership once, when you join.
 *
 * There is no automatic reconnect. A dropped connection ends with a `close`
 * event saying why; `close.revoked` means you were removed and reconnecting
 * will be refused. Anything else, call `connectRoom` again.
 */
import { CLOSE, type ClientMessage, type HostMessage } from './protocol'

/** The parts of a WebSocket this uses, so a test or another runtime can supply one. */
export interface SocketLike {
  readyState: number
  send(text: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: any) => void): void
}

export type SocketFactory = (url: string) => SocketLike

export interface ConnectOptions {
  /** The host's room socket, e.g. `wss://example.com/rooms`. */
  url: string
  room: string
  /** A signed-in ID token; it travels in the join message, never in the URL. */
  token: string
  /** Defaults to the global `WebSocket`. */
  socket?: SocketFactory
  /** Give up on joining after this long (default 10 s). */
  timeoutMs?: number
}

export interface CloseInfo {
  code: number
  reason: string
  /** You were removed, or the room was closed: rejoining will be refused. */
  revoked: boolean
}

export interface RoomEvents {
  message: (from: string, data: unknown) => void
  joined: (uid: string) => void
  left: (uid: string) => void
  limited: (reason: string) => void
  close: (info: CloseInfo) => void
}

export interface RoomConnection {
  readonly room: string
  /** Your uid, as the host knows you. */
  readonly you: string
  /** Who is connected, you included, kept current as people come and go. */
  readonly members: readonly string[]
  /** Send to every other member. Dropped by the host past the room's rate (you get `limited`). */
  send(data: unknown): void
  on<E extends keyof RoomEvents>(event: E, listener: RoomEvents[E]): () => void
  leave(): void
}

/** The host refused the join: not a member, a bad token, or no such room. */
export class RoomRefused extends Error {
  constructor(
    message: string,
    readonly code: number
  ) {
    super(message)
    this.name = 'RoomRefused'
  }
}

const OPEN = 1

export function connectRoom(options: ConnectOptions): Promise<RoomConnection> {
  const factory: SocketFactory = options.socket ?? ((url) => new WebSocket(url) as unknown as SocketLike)
  const socket = factory(options.url)
  const listeners: { [E in keyof RoomEvents]: Set<RoomEvents[E]> } = {
    message: new Set(),
    joined: new Set(),
    left: new Set(),
    limited: new Set(),
    close: new Set(),
  }
  const emit = <E extends keyof RoomEvents>(event: E, ...args: Parameters<RoomEvents[E]>) => {
    for (const listener of listeners[event]) {
      try {
        ;(listener as (...a: unknown[]) => void)(...args)
      } catch (e) {
        // One listener's bug must not stop the others hearing the message.
        console.error(e)
      }
    }
  }
  const sendRaw = (message: ClientMessage) => socket.send(JSON.stringify(message))

  return new Promise((resolve, reject) => {
    let connection: (RoomConnection & { members: string[] }) | null = null
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.close(1000, 'join timed out')
      reject(new Error('the room did not answer the join in time'))
    }, options.timeoutMs ?? 10_000)

    socket.addEventListener('open', () => sendRaw({ type: 'join', room: options.room, token: options.token }))

    socket.addEventListener('message', (event: { data: unknown }) => {
      let message: HostMessage
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (!connection) {
        if (message.type === 'joined') {
          const members = [...message.members]
          connection = {
            room: message.room,
            you: message.you,
            members,
            send: (data) => {
              if (socket.readyState === OPEN) sendRaw({ type: 'send', data })
            },
            on: (event, listener) => {
              listeners[event].add(listener as never)
              return () => listeners[event].delete(listener as never)
            },
            leave: () => socket.close(1000, 'left'),
          }
          settled = true
          clearTimeout(timer)
          resolve(connection)
        } else if (message.type === 'refused' && !settled) {
          settled = true
          clearTimeout(timer)
          reject(new RoomRefused(message.reason, CLOSE.refused))
        }
        return
      }
      switch (message.type) {
        case 'message':
          emit('message', message.from, message.data)
          break
        case 'presence':
          if ('joined' in message) {
            if (!connection.members.includes(message.joined)) connection.members.push(message.joined)
            emit('joined', message.joined)
          } else {
            const i = connection.members.indexOf(message.left)
            if (i >= 0) connection.members.splice(i, 1)
            emit('left', message.left)
          }
          break
        case 'limited':
          emit('limited', message.reason)
          break
      }
    })

    socket.addEventListener('close', (event: { code: number; reason: string }) => {
      clearTimeout(timer)
      if (!settled) {
        settled = true
        reject(event.code === CLOSE.refused ? new RoomRefused(event.reason || 'refused', event.code) : new Error(`the connection closed before joining (${event.code})`))
        return
      }
      if (connection) emit('close', { code: event.code, reason: event.reason, revoked: event.code === CLOSE.revoked })
    })
  })
}
