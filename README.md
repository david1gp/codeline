# Codeline

`@adaptive-ds/codeline` is a local-first coding workspace foundation for AI-assisted software development. It is intended to bring a focused editor-like experience to a SolidJS interface while making application state durable, synchronized, and inspectable as those capabilities are implemented.

The implemented foundation uses:

- **Bun and TypeScript** for the runtime and toolchain.
- **SolidJS** with `@adaptive-ds/solid-ui` for the browser application.
- **Hono** for the application API and explicit streaming boundaries.
- **TanStack AI** for the SSE conversion seam and streamed event shape used by the deterministic test stream.
- **Valibot** for request validation and response contracts exercised by the UI and tests.

Local PostgreSQL and Zero development services are defined under `ops/dev/`. PostgreSQL uses `postgres:18-alpine`; Zero uses a Podman-built image from the latest package generated from the pinned local `/home/david/opensource/zero` checkout. Drizzle owns the application schema and migrations; Zero consumes the same PostgreSQL database for synchronization.

The planned provider targets are local CLIProxyAPI and Codex-LB configurations. Provider OAuth, Pi ecosystem integrations, MCP, full-text web search, and custom scrollbar behavior are outside the planned scope.

## Source Layout

Top-level folders under `src/` are bounded contexts. Each domain context owns its own layers:

```txt
src/
├── identity/{api,db}
├── servers/{api,actions,db,schema}
├── agents/{api,actions,db,schema}
├── session/{api,actions,db,schema}
├── message/{api,actions,db,schema}
├── stream/db
├── database/
├── api/
├── app/
├── configuration/
├── server/
└── ui/
```

- `schema/` holds Valibot request and query contracts for that context.
- `api/` holds Hono route registration only.
- `actions/` holds application operations such as `sessionCreate` and `serverList`.
- `db/` holds Drizzle tables and repositories.
- `database/` holds shared persistence infrastructure only: the client, transactions, migrations, `databaseSchema.ts`, and `zeroSchema.ts`.
- `api/` at the top level holds platform HTTP only: health, readiness, errors, testing, and route composition.
- `server/` is the HTTP process. The server domain context is `servers/`.

HTTP paths can nest across contexts. Agent routes stay at `/servers/:serverId/agents` and message routes stay at `/sessions/:sessionId/messages`; the owning context still registers them.

## Status

The current increment is a runnable minimal Solid/Hono/Valibot/TanStack AI test slice plus local PostgreSQL/Zero service definitions, not a complete coding workspace. The Solid UI renders an empty workspace and checks `/api/health`. The Bun/Hono API exposes health, validation, deterministic error, and SSE test routes. The TanStack AI seam converts deterministic `StreamChunk` events to SSE; it does not execute a model or provide production AI behavior.

## Implemented Routes

- `GET /health` and `GET /api/health` return the Codeline health response.
- `POST /api/testing/echo` accepts `{ "message": "..." }` and rejects an empty or invalid message with a structured `400` response.
- `GET /api/testing/errors/bad-request` and `GET /api/testing/errors/internal-server-error` return deterministic structured error responses.
- `GET /api/testing/stream` returns `text/event-stream` events with sequential IDs. Its `scenario` is `normal`, `error`, `unexpected-end`, or `idle-timeout`; optional `delayMs` and `idleTimeoutMs` values must be between 1 and 60000 milliseconds.

## Local Development

Requirements: Bun 1.3 or newer, rootless Podman with a working Compose provider, and `git`.

The Codeline wrapper uses Podman's default rootless storage and does not set project-specific `--root` or `--runroot` paths. On this development host those defaults are `/home/david/.local/share/containers/storage` and `/run/user/1001/containers`; no Codeline Podman state is created under `/tmp`.

```bash
bun install
cp .env.example .env
chmod 600 .env
# Replace the local password/admin placeholders in .env. Keep all real values there.
./ops/dev/zero-link.sh setup
./ops/dev/codeline-dev.sh config
./ops/dev/codeline-dev.sh build
./ops/dev/codeline-dev.sh up
./ops/dev/codeline-dev.sh migrate
./ops/dev/codeline-dev.sh status
bun run dev
```

The services use an isolated `codeline-dev` network and named volumes (`codeline-dev-postgres` and `codeline-dev-zero`). PostgreSQL is published at `127.0.0.1:5432`; Zero sync is published at `http://127.0.0.1:4848`. The Vite server proxies `/api` to the API at `http://127.0.0.1:3004`.

The Postgres service starts with logical replication enabled (`wal_level=logical`, 10 replication slots, and 10 WAL senders). Zero waits for the Postgres health check, persists its SQLite replica in its named volume, and exposes `/` as its health check. The migration command is intentionally separate so schema changes remain owned by Drizzle.

Set up or verify the local Zero link without using registry Zero:

```bash
./ops/dev/zero-link.sh setup
./ops/dev/zero-link.sh verify
```

After cloning, developers must run `./ops/dev/zero-link.sh setup` from a Codeline checkout. `ZERO_CHECKOUT` in `.env` selects the pinned Zero checkout and defaults to `/home/david/opensource/zero`; the setup builds `packages/zero` with `pnpm@11.11.0`, registers that public package with Bun, and links `@rocicorp/zero` into Codeline. The setup and verify commands are idempotent. This is intentionally the latest local Zero workflow and is not reproducible from a clean clone or CI yet; that work is deferred. `ops/dev/zero-pkgs/` remains ignored for old local artifacts but is not used.

CI is intentionally not viable for the full check suite until Zero dependency reproducibility is revisited. The workflow therefore runs only the clean-clone-safe format check; typecheck, tests, build, and database checks remain local commands after the Zero link is established.

Service lifecycle commands:

```bash
./ops/dev/codeline-dev.sh up
./ops/dev/codeline-dev.sh start
./ops/dev/codeline-dev.sh stop
./ops/dev/codeline-dev.sh status
./ops/dev/codeline-dev.sh logs zero-cache
./ops/dev/codeline-dev.sh down
./ops/dev/codeline-dev.sh reset
```

`down` removes containers but keeps data. `reset` also removes both named volumes and is the destructive local reset. Run `migrate` after `up` and after any new migration generation:

```bash
./ops/dev/codeline-dev.sh migrate
bun run db:generate
./ops/dev/codeline-dev.sh migrate
```

Troubleshooting:

- If configuration validation reports a missing variable, ensure `.env` exists and contains the required names from `.env.example`; the wrapper reports names only, never values.
- If `podman compose` is unavailable, install/configure a Podman Compose provider and retry `./ops/dev/codeline-dev.sh config`.
- If ports `5432` or `4848` are busy, change `POSTGRES_PORT` or `ZERO_PORT` in ignored `.env`, update the matching host port in `DATABASE_URL` or `ZERO_CACHE_URL`, then rerun `config` and `up`.
- If Zero retains a stale replica after schema or database experiments, run `reset`, then `build`, `up`, and `migrate` again.
- Inspect `./ops/dev/codeline-dev.sh logs postgres` and `./ops/dev/codeline-dev.sh logs zero-cache` for service diagnostics.

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
bun run typecheck
bun run test
bun run build
bun run db:check
bun run release
```

Copy `.env.example` to `.env` only when configuring local application work. The checked-out `.env` is ignored and contains generated local-only values; it contains no external credentials.

## Roadmap

The implemented routes and UI are foundations for the remaining work. Planned work first covers Codeline parity with `pi-web`, then production AI execution, PostgreSQL persistence, Zero synchronization, durable stream replay, and the explicitly scoped extensions: multiple servers and agents, subagents, reloadable Git-backed configuration, and SSO/OIDC. None of those capabilities is available in the current slice.

## License

MIT. See [LICENSE](./LICENSE).
