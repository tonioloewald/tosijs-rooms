import { test, expect } from 'bun:test'
import { roomsApi, RoomError } from './api'

function recorder(status = 200, body: unknown = { id: 'r1' }) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = []
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body as string | undefined })
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof globalThis.fetch
  return { calls, fetch }
}

test('each call maps onto /room, with a fresh token', async () => {
  const { calls, fetch } = recorder()
  let n = 0
  const api = roomsApi({ endpoint: 'https://host/room', getToken: async () => `t${++n}`, fetch })
  await api.create({ maxMembers: 4 })
  await api.join('r1', 'CODE')
  await api.get('r1')
  await api.remove('r1', 'bob')
  await api.close('r1')
  expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
    ['POST', 'https://host/room', '{"maxMembers":4}'],
    ['PUT', 'https://host/room', '{"id":"r1","code":"CODE"}'],
    ['GET', 'https://host/room?id=r1', undefined],
    ['DELETE', 'https://host/room?id=r1&uid=bob', undefined],
    ['DELETE', 'https://host/room?id=r1', undefined],
  ])
  expect(calls.map((c) => c.headers.Authorization)).toEqual(['Bearer t1', 'Bearer t2', 'Bearer t3', 'Bearer t4', 'Bearer t5'])
})

test("a refusal throws RoomError with the host's code", async () => {
  const { fetch } = recorder(404, { error: 'not-found', message: 'not found' })
  const api = roomsApi({ endpoint: 'https://host/room', getToken: () => 't', fetch })
  const error = await api.join('r1', 'WRONG').catch((e) => e)
  expect(error).toBeInstanceOf(RoomError)
  expect([error.status, error.error, error.message]).toEqual([404, 'not-found', 'not found'])
})
