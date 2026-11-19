# CLAUDE.md

Shared engineering practices live at https://github.com/tonioloewald/tosijs-coding-practices,
checked out beside this repo at `../tosijs-coding-practices`. Read that index first; this file
records only what is specific to this repo.

## What this is

The client for tosijs-platform's game rooms (tosijs-platform DECISIONS.md D26). The host side is
`functions/src/rooms/` there; `src/protocol.ts` here mirrors `rooms/relay.ts`, so a protocol
change lands in both.

## Commands

```sh
bun test           # unit tests (a fake socket and a fake fetch)
bun run typecheck
bun run build      # dist/: ESM bundle + declarations
```

Interop with a real host was checked by running the built client against tosijs-platform's
`serveLocal` (make, join, relay, refuse, remove, close).
