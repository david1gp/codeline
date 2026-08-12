# Codeline

`@adaptive-ds/codeline` is a local-first coding workspace foundation for AI-assisted software development. It is intended to bring a focused editor-like experience to a SolidJS interface while making application state durable, synchronized, and inspectable as those capabilities are implemented.

The implemented foundation uses:

- **Bun and TypeScript** for the runtime and toolchain.
- **SolidJS** with `@adaptive-ds/solid-ui` for the browser application.
- **Hono** for the application API and explicit streaming boundaries.
- **TanStack AI** for the SSE conversion seam and streamed event shape used by the deterministic test stream.
- **Valibot** for request validation and response contracts exercised by the UI and tests.

PostgreSQL and Zero are planned persistence and synchronization foundations; they are not part of the current slice.

The planned provider targets are local CLIProxyAPI and Codex-LB configurations. Provider OAuth, Pi ecosystem integrations, MCP, full-text web search, and custom scrollbar behavior are outside the planned scope.

## Status

The current increment is a runnable minimal Solid/Hono/Valibot/TanStack AI test slice, not a complete coding workspace. The Solid UI renders an empty workspace and checks `/api/health`. The Bun/Hono API exposes health, validation, deterministic error, and SSE test routes. The TanStack AI seam converts deterministic `StreamChunk` events to SSE; it does not execute a model or provide production AI behavior.

## Implemented Routes

- `GET /health` and `GET /api/health` return the Codeline health response.
- `POST /api/testing/echo` accepts `{ "message": "..." }` and rejects an empty or invalid message with a structured `400` response.
- `GET /api/testing/errors/bad-request` and `GET /api/testing/errors/internal-server-error` return deterministic structured error responses.
- `GET /api/testing/stream` returns `text/event-stream` events with sequential IDs. Its `scenario` is `normal`, `error`, `unexpected-end`, or `idle-timeout`; optional `delayMs` and `idleTimeoutMs` values must be between 1 and 60000 milliseconds.

## Local Development

Requirements: Bun 1.3 or newer.

```bash
bun install
bun run dev
```

The development command starts the Hono API on `http://127.0.0.1:3004` and the Vite Solid UI on `http://127.0.0.1:5173` when using the supplied `.env.example` values. The Vite server proxies `/api` to the API. No external provider credentials, database, or Zero service is required for this slice.

Example route checks:

```bash
curl http://127.0.0.1:3004/health
curl -X POST http://127.0.0.1:3004/api/testing/echo \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}'
curl -N 'http://127.0.0.1:3004/api/testing/stream?scenario=normal'
```

Useful commands:

```bash
bun run format
bun run format:check
bun run test
bun run build
bun run release
```

Copy `.env.example` to `.env` only when configuring local application work. The checked-out `.env` is ignored and contains generated local-only values; it contains no external credentials.

## Roadmap

The implemented routes and UI are foundations for the remaining work. Planned work first covers Codeline parity with `pi-web`, then production AI execution, PostgreSQL persistence, Zero synchronization, durable stream replay, and the explicitly scoped extensions: multiple servers and agents, subagents, reloadable Git-backed configuration, and SSO/OIDC. None of those capabilities is available in the current slice.

## License

MIT. See [LICENSE](./LICENSE).
