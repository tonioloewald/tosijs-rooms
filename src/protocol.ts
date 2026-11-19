/**
 * The room protocol, as a tosijs-platform host speaks it (its D26).
 *
 * JSON text messages over a WebSocket. The host's side is
 * `functions/src/rooms/relay.ts` in tosijs-platform; a change here is a change
 * there.
 *
 *   client → { type: 'join', room, token }    the first message
 *   host   → { type: 'joined', room, you, members }
 *          | { type: 'refused', reason }       then the host closes
 *   client → { type: 'send', data }
 *   host   → { type: 'message', from, data }   from every OTHER member
 *          | { type: 'presence', joined } | { type: 'presence', left }
 *          | { type: 'limited', reason }       one of your messages was dropped
 */

export type ClientMessage = { type: 'join'; room: string; token: string } | { type: 'send'; data: unknown }

export type HostMessage =
  | { type: 'joined'; room: string; you: string; members: string[] }
  | { type: 'refused'; reason: string }
  | { type: 'message'; from: string; data: unknown }
  | { type: 'presence'; joined: string }
  | { type: 'presence'; left: string }
  | { type: 'limited'; reason: string }

/** Why the host closed a connection (RFC 6455 leaves 4000–4999 to applications). */
export const CLOSE = {
  /** Not a member, a bad token, or no such room: the host does not say which. */
  refused: 4403,
  /** Removed from the room, or the room was closed. */
  revoked: 4401,
  /** A message the host could not read. */
  protocol: 4400,
  /** A message over the room's size limit. */
  tooBig: 1009,
  /** No join within the host's time limit. */
  joinTimeout: 4408,
} as const

/** The limits a room relays under. */
export interface RoomLimits {
  /** The largest message, in bytes of its JSON text. */
  messageBytes: number
  /** Sustained messages per second per member. */
  perSecond: number
}

/** A room as `/room` describes it. Only its creator sees `code`. */
export interface RoomInfo {
  id: string
  creator: string
  members: string[]
  maxMembers: number
  limits: RoomLimits
  expires: string
  code?: string
}
