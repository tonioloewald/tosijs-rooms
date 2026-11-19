import { test, expect, describe } from 'bun:test'
import { connectRoom, RoomRefused, type SocketLike } from './connect'
import { CLOSE } from './protocol'

/** A socket the test plays the host for. */
function fakeHost() {
  const sent: unknown[] = []
  const handlers: Record<string, Array<(e: any) => void>> = {}
  const socket: SocketLike & { closedWith?: [number?, string?] } = {
    readyState: 0,
    send: (text) => sent.push(JSON.parse(text)),
    close(code, reason) {
      socket.closedWith = [code, reason]
      socket.readyState = 3
      fire('close', { code: code ?? 1000, reason: reason ?? '' })
    },
    addEventListener: (type, listener) => (handlers[type] ??= []).push(listener),
  }
  const fire = (type: string, event: unknown) => (handlers[type] ?? []).forEach((h) => h(event))
  return {
    socket,
    sent,
    open: () => {
      socket.readyState = 1
      fire('open', {})
    },
    say: (message: unknown) => fire('message', { data: JSON.stringify(message) }),
    hangUp: (code: number, reason = '') => {
      socket.readyState = 3
      fire('close', { code, reason })
    },
  }
}

const joinedAs = async (you = 'ada', members = ['ada']) => {
  const host = fakeHost()
  const pending = connectRoom({ url: 'ws://host/rooms', room: 'R', token: 'T', socket: () => host.socket })
  host.open()
  host.say({ type: 'joined', room: 'R', you, members })
  return { host, room: await pending }
}

describe('joining', () => {
  test('sends the token in the join message, and resolves once joined', async () => {
    const { host, room } = await joinedAs('ada', ['bob', 'ada'])
    expect(host.sent).toEqual([{ type: 'join', room: 'R', token: 'T' }])
    expect(room.you).toBe('ada')
    expect(room.members).toEqual(['bob', 'ada'])
  })

  test('a refusal rejects with RoomRefused', async () => {
    const host = fakeHost()
    const pending = connectRoom({ url: 'u', room: 'R', token: 'T', socket: () => host.socket })
    host.open()
    host.say({ type: 'refused', reason: 'not a member of this room' })
    host.hangUp(CLOSE.refused, 'not a member of this room')
    await expect(pending).rejects.toBeInstanceOf(RoomRefused)
  })

  test('closing before joining rejects', async () => {
    const host = fakeHost()
    const pending = connectRoom({ url: 'u', room: 'R', token: 'T', socket: () => host.socket })
    host.hangUp(1006)
    await expect(pending).rejects.toThrow('closed before joining (1006)')
  })

  test('no answer in time rejects and closes', async () => {
    const host = fakeHost()
    const pending = connectRoom({ url: 'u', room: 'R', token: 'T', socket: () => host.socket, timeoutMs: 5 })
    host.open()
    await expect(pending).rejects.toThrow('in time')
    expect(host.socket.closedWith?.[0]).toBe(1000)
  })
})

describe('in the room', () => {
  test('messages arrive with their sender; send goes to the host', async () => {
    const { host, room } = await joinedAs()
    const heard: unknown[] = []
    room.on('message', (from, data) => heard.push([from, data]))
    host.say({ type: 'message', from: 'bob', data: { x: 1 } })
    room.send({ y: 2 })
    expect(heard).toEqual([['bob', { x: 1 }]])
    expect(host.sent.at(-1)).toEqual({ type: 'send', data: { y: 2 } })
  })

  test('members stay current as people come and go', async () => {
    const { host, room } = await joinedAs()
    const events: string[] = []
    room.on('joined', (u) => events.push(`+${u}`))
    room.on('left', (u) => events.push(`-${u}`))
    host.say({ type: 'presence', joined: 'bob' })
    host.say({ type: 'presence', joined: 'cy' })
    host.say({ type: 'presence', left: 'bob' })
    expect(room.members).toEqual(['ada', 'cy'])
    expect(events).toEqual(['+bob', '+cy', '-bob'])
  })

  test('a listener can be removed; one that throws does not stop the others', async () => {
    const { host, room } = await joinedAs()
    const heard: string[] = []
    const off = room.on('message', () => heard.push('first'))
    room.on('message', () => {
      throw new Error('a bug in a game')
    })
    room.on('message', () => heard.push('third'))
    const error = console.error
    console.error = () => undefined
    try {
      host.say({ type: 'message', from: 'bob', data: 1 })
      off()
      host.say({ type: 'message', from: 'bob', data: 2 })
    } finally {
      console.error = error
    }
    expect(heard).toEqual(['first', 'third', 'third'])
  })

  test('limited, and a close that says whether you were removed', async () => {
    const { host, room } = await joinedAs()
    const seen: unknown[] = []
    room.on('limited', (r) => seen.push(r))
    room.on('close', (info) => seen.push(info))
    host.say({ type: 'limited', reason: 'at most 30 messages a second' })
    host.hangUp(CLOSE.revoked, 'removed from the room')
    expect(seen).toEqual(['at most 30 messages a second', { code: CLOSE.revoked, reason: 'removed from the room', revoked: true }])
  })

  test('after leaving, send is a no-op', async () => {
    const { host, room } = await joinedAs()
    room.leave()
    const before = host.sent.length
    room.send('late')
    expect(host.sent.length).toBe(before)
  })
})
