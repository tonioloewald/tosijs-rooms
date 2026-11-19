/**
 * tosijs-rooms: realtime game rooms on a tosijs-platform host.
 *
 * Make a room with `roomsApi(…).create()`, share its code, and each player
 * calls `connectRoom(…)` to join. Rooms are relay-only: each player's machine
 * runs the game, and the host passes messages between members. Results that
 * matter (a mission's outcome, an unlock) are saved through the host's normal
 * document endpoint, not sent through the room.
 *
 * @packageDocumentation
 */
export { connectRoom, RoomRefused } from './src/connect'
export type { ConnectOptions, RoomConnection, RoomEvents, CloseInfo, SocketLike, SocketFactory } from './src/connect'
export { roomsApi, RoomError } from './src/api'
export type { RoomsApi, RoomsApiOptions } from './src/api'
export { CLOSE } from './src/protocol'
export type { RoomInfo, RoomLimits, ClientMessage, HostMessage } from './src/protocol'
