# [XS] Drain the voice goodbye instead of waiting

## Goal

When a `/voice` call ends, the page's final `session-ending` record reaches
the agent because the connection drains on close, not because of a fixed
wait.

## Plan

The page no longer waits before unmounting `<moq-publish>`, and the pinned
`moq` submodule drains the session when its reconnect loop ends
([moq-dev/moq#6630](https://github.com/moq-dev/moq/pull/6630)), so the
record goes out whenever the connection closes. A local relay test with the
connection closed at once delivered it every time; swapping the drain back
to an abort lost it every time. That test lives in moq's reload teardown
suite. It does not read the demo agent's log. The shared pool still lingers 2 s
(`LINGER_MS` in `moq/js/net/src/connection/pool.ts`) before that close, and
the finished track keeps sending during the linger.

## Waiting

- Maintainer: On new.moq.dev/voice, hang up a live call and confirm the agent
  logs the `session-ending` record rather than a timeout. Wait out the 2 s
  linger before calling it a miss, then delete this quest. An agent cannot
  take this step. Cloudflare Turnstile and a microphone gate the page, and
  the agent log is not in this repository. A local relay drain (already
  passing) and a headless browser were considered. Neither can pass Turnstile
  or read that log.
