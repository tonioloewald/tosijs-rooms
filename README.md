# tosijs-rooms

Realtime game rooms on a [tosijs-platform](https://github.com/tonioloewald/loewald-dot-com) host.
Make a room, share its code, and the host relays messages between the players in it.

Rooms are **relay-only**: each player's machine runs the game, and the host passes each message
to the room's other members, labelled with who sent it. The host checks who is a member once,
when they join. Save results that matter (a mission's outcome, an unlock) through the host's
document endpoint, not through the room: a player's machine can report anything.

```ts
import { roomsApi, connectRoom } from 'tosijs-rooms'

const api = roomsApi({ endpoint: 'https://example.com/room', getToken: () => user.getIdToken() })

// One player makes the room and shares its code.
const { id, code } = await api.create({ maxMembers: 4 })

// Others join with the code, then everyone connects.
await api.join(id, code)
const room = await connectRoom({ url: 'wss://example.com/rooms', room: id, token: await user.getIdToken() })

room.on('message', (from, data) => applyUpdate(from, data))
room.on('joined', (uid) => addPlayer(uid))
room.on('left', (uid) => removePlayer(uid))
room.on('close', ({ revoked }) => (revoked ? showRemoved() : reconnect()))
room.send({ pos: craft.position })
```

## Limits

Each room has a message size limit and a messages-per-second limit, set by the host (4 KB and 30
a second by default). A room may ask for lower ones when it is made. An oversized message closes
the connection; past the rate, a message is dropped and you get a `limited` event. Send
updates at 10–20 a second and interpolate between them.

A room holds up to 16 members (8 by default) and lasts 24 hours. Each player may have 5 open
rooms. The creator may remove members and close the room; a member may leave.

## Hosts

Today the platform's own (Bun) host serves rooms. A Firebase backend (Realtime Database) is
planned behind the same API, so a game written against this package runs on either.

There is no automatic reconnect. `close.revoked` means you were removed and rejoining will be
refused; for anything else, call `connectRoom` again.

## Licence

Apache-2.0.
