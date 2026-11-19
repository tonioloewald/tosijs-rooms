/**
 * Making and managing rooms through the host's `/room` endpoint.
 *
 * Every call needs a signed-in caller. `getToken` is called for each request,
 * so a sign-in library that refreshes tokens (Firebase's does, hourly) keeps
 * working.
 */
import type { RoomInfo, RoomLimits } from './protocol'

export interface RoomsApiOptions {
  /** The `/room` endpoint's URL. */
  endpoint: string
  getToken: () => string | Promise<string>
  fetch?: typeof fetch
}

/** A refusal from `/room`, with the host's error code (`not-found`, `refused`, `bad-request`, `unauthenticated`). */
export class RoomError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly error: string
  ) {
    super(message)
    this.name = 'RoomError'
  }
}

export interface RoomsApi {
  /** Make a room; you are its creator and first member. The result carries the code others join with. */
  create(options?: { maxMembers?: number; limits?: Partial<RoomLimits> }): Promise<RoomInfo>
  /** Join a room with its code. */
  join(id: string, code: string): Promise<RoomInfo>
  /** A room you are a member of. */
  get(id: string): Promise<RoomInfo>
  /** Leave a room (the creator closes it instead). */
  leave(id: string, you: string): Promise<RoomInfo>
  /** The creator removes a member; their connection closes at once. */
  remove(id: string, uid: string): Promise<RoomInfo>
  /** The creator closes the room; every connection closes. */
  close(id: string): Promise<void>
}

export function roomsApi(options: RoomsApiOptions): RoomsApi {
  const doFetch = options.fetch ?? fetch
  const call = async <T>(method: string, query: Record<string, string> = {}, body?: unknown): Promise<T> => {
    const url = new URL(options.endpoint)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    const response = await doFetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${await options.getToken()}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const json = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
    if (!response.ok) throw new RoomError(json.message ?? response.statusText, response.status, json.error ?? 'internal')
    return json as T
  }
  return {
    create: (o = {}) => call('POST', {}, o),
    join: (id, code) => call('PUT', {}, { id, code }),
    get: (id) => call('GET', { id }),
    leave: (id, you) => call('DELETE', { id, uid: you }),
    remove: (id, uid) => call('DELETE', { id, uid }),
    close: async (id) => {
      await call('DELETE', { id })
    },
  }
}
