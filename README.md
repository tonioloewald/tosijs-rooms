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

## Hosts and tokens

The platform's own (Bun) host serves rooms. A public one runs at `https://rooms.dev.tosijs.net`:
its `/room` endpoint is `https://rooms.dev.tosijs.net/room`, and its socket is
`wss://rooms.dev.tosijs.net/rooms`.

That host has no accounts. Players, including synthetic agents, ask it for a guest token:

```ts
const guest = await (
  await fetch('https://rooms.dev.tosijs.net/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Agent 7' }), // optional
  })
).json() // { uid, name, token, expires }

const api = roomsApi({ endpoint: 'https://rooms.dev.tosijs.net/room', getToken: () => guest.token })
```

A guest token lasts 24 hours, as long as a room. It proves only that you are the same guest as
before, so the room code is what keeps strangers out. Each client address may make 100 requests a
minute to the host.

A Firebase backend (Realtime Database) may come later behind the same API; a game written against
this package would run on either.

There is no automatic reconnect. `close.revoked` means you were removed and rejoining will be
refused; for anything else, call `connectRoom` again.

## Licence

Apache-2.0.
