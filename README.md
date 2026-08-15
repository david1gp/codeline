# @adaptive-ds/codeline

Codeline is an AI coding workspace built for the fastest possible UI/UX. Its foundation is [Rocicorp Zero](https://zero.rocicorp.dev/), which turns durable PostgreSQL state into reactive browser data so the interface can stay synchronized and feel immediate.

The goal is AI coding that does not suck: instant feedback, durable application state, and a focused workspace that stays out of the way.

- **Immediate reads** — Zero answers queries from client-side data first, then follows with authoritative server results
- **Incremental live queries** — synchronized changes update existing query results instead of requiring full refetches
- **Fine-grained rendering** — SolidJS and `@adaptive-ds/solid-ui` update only the UI affected by those changes
- **Durable server state** — PostgreSQL and Drizzle own application data while Zero makes it reactive in the browser
- **Explicit boundaries** — Hono, Valibot, and TanStack AI provide typed APIs, validation, and streaming seams
- **Simple toolchain** — Bun and TypeScript power development, testing, and production builds

Quick Links

- site - http://codeline.work/
- code - https://github.com/david1gp/codeline
- issues - https://github.com/david1gp/codeline/issues
- solid-ui - https://github.com/david1gp/solid-ui
- zero - https://zero.rocicorp.dev/
- zero code - https://github.com/rocicorp/mono

## Status

Codeline is a runnable AI coding workspace. It provides synchronized session navigation, provider-backed chat execution, durable messages and execution events, stream replay, bounded retries and subagents, project/file browsing, Git branch controls, Markdown rendering, provider/model selection, simulation fixtures, and a responsive `/demo` showcase. It also includes provider-neutral OIDC/PKCE authentication, protected UI state, Zero cache isolation, and an installable PWA baseline.

The Hono API persists durable state in PostgreSQL through Drizzle. Zero synchronizes authorized reads into the browser; commands and chat execution continue to go through the application API. The chat runtime supports deterministic fixtures and the configured local CLIProxyAPI/Codex-LB provider targets.

Local development and verification currently use the pinned local Zero and git-store checkouts through Bun links. `bun run release` runs the local format, test, and build preflight; `bun run deploy` runs the local build preflight only. GitHub release artifacts, clean-clone/CI reproducibility, and deployment automation are deferred and are not current priorities.

Provider OAuth, Pi ecosystem integrations, MCP, full-text web search, custom scrollbar behavior, trusted folders / project trust, editing or limiting AI capabilities, and AI permission management are out of scope.

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

## Implemented Routes

Health and readiness:

- `GET /health` and `GET /api/health` return the Codeline health response.
- `GET /api/ready` reports process readiness.

Workspace data:

- `GET /api/servers` and `GET /api/servers/:serverId/agents`
- `GET /api/sessions`, `POST /api/sessions`
- `GET /api/sessions/:sessionId`, `PATCH /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/archive`, `DELETE /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/messages`, `POST /api/sessions/:sessionId/messages`

Test seams:

- `POST /api/testing/echo` accepts `{ "message": "..." }` and rejects an empty or invalid message with a structured `400`.
- `GET /api/testing/errors/bad-request` and `GET /api/testing/errors/internal-server-error` return deterministic structured errors.
- `GET /api/testing/stream` returns `text/event-stream` events with sequential IDs. `scenario` is `normal`, `error`, `unexpected-end`, or `idle-timeout`; optional `delayMs` and `idleTimeoutMs` values must be between 1 and 60000 milliseconds.

## Local Development

Requirements: Bun 1.3 or newer, rootless Podman with a working Compose provider, and `git`.

The Codeline wrapper uses Podman's default rootless storage and does not set project-specific `--root` or `--runroot` paths. On this development host those defaults are `/home/david/.local/share/containers/storage` and `/run/user/1001/containers`; no Codeline Podman state is created under `/tmp`.

```bash
bun install
cp .env.example .env
chmod 600 .env
# Replace the local password/admin placeholders in .env. Keep all real values there.
./ops/dev/git-store-link.sh setup
./ops/dev/zero-link.sh setup
./ops/dev/codeline-dev.sh config
./ops/dev/codeline-dev.sh build
./ops/dev/codeline-dev.sh up
./ops/dev/codeline-dev.sh migrate
./ops/dev/codeline-dev.sh status
bun run dev
```

Project discovery roots are configured with `CODELINE_PROJECT_ROOTS` as a JSON string array. Omit the variable, or leave it blank, to discover projects from the operating-system home directory. Set it to an explicit empty array (`[]`) to disable project discovery. Relative roots are normalized from the Codeline process working directory and duplicate roots are removed.

For example, configure multiple roots with:

```dotenv
CODELINE_PROJECT_ROOTS=["./projects","../shared-projects"]
```

Services use an isolated `codeline-dev` network and named volumes (`codeline-dev-postgres` and `codeline-dev-zero`). The managed host listeners are UI `127.0.0.1:6000`, API `127.0.0.1:6001`, PostgreSQL `127.0.0.1:6002`, and Zero sync `http://127.0.0.1:6003`. PostgreSQL and Zero retain their upstream-required container ports `5432` and `4848`; the Vite server proxies `/api` to `http://127.0.0.1:6001`.

Postgres starts with logical replication enabled (`wal_level=logical`, 10 replication slots, and 10 WAL senders). Zero waits for the Postgres health check, persists its SQLite replica in its named volume, and exposes `/` as its health check. Migrations stay on a separate command so schema changes remain owned by Drizzle.

Set up or verify the local Zero link without using registry Zero:

```bash
./ops/dev/zero-link.sh setup
./ops/dev/zero-link.sh verify
```

After cloning, run `./ops/dev/zero-link.sh setup` from a Codeline checkout. `ZERO_CHECKOUT` in `.env` selects the pinned Zero checkout and defaults to `/home/david/opensource/zero`. Setup builds `packages/zero` with `pnpm@11.11.0`, registers that public package with Bun, and links `@rocicorp/zero` into Codeline. Setup and verify are idempotent.

This is intentionally the latest local Zero workflow. It is not reproducible from a clean clone or CI yet; that work is deferred. `ops/dev/zero-pkgs/` remains ignored for old local artifacts but is not used.

Set up or verify the local git-store link:

```bash
bun run git-store:link
bun run git-store:verify
```

The link script installs and builds the clean sibling checkout at `../git-store-clean-779c05b`, runs `bun link` in that checkout, and links `@adaptive-ds/git-store` into Codeline. Set `GIT_STORE_CHECKOUT` in the environment or ignored `.env` to use another local checkout. Configuration writes always use `autoPush: false`; this setup does not add or use remote pushes.

Like the Zero link, this is a local-checkout workflow and is not reproducible from a clean Codeline clone or CI. A clean clone needs the git-store checkout, its built `dist/`, and the local Bun link before Codeline dependencies and checks can resolve.

Verify the immutable release inputs without network access:

```bash
bun run release:inputs:verify
```

This checks the pinned Bun version, linked package targets, Git revisions and cleanliness, package identities and exports, and required build outputs. It reports a blocker when a provisioned source directory cannot prove its Git provenance.

GitHub release artifacts and clean-clone/CI dependency reproducibility are deferred. Typecheck, tests, build, database checks, and release-input verification remain local commands after the Zero and git-store links are established.

Service lifecycle:

```bash
./ops/dev/codeline-dev.sh up
./ops/dev/codeline-dev.sh start
./ops/dev/codeline-dev.sh stop
./ops/dev/codeline-dev.sh status
./ops/dev/codeline-dev.sh logs zero-cache
./ops/dev/codeline-dev.sh down
./ops/dev/codeline-dev.sh reset
./ops/dev/codeline-dev.sh clean
```

`down` removes containers but keeps data. `reset` also removes both named volumes and is the destructive local reset. Run `migrate` after `up` and after any new migration generation:

```bash
./ops/dev/codeline-dev.sh migrate
bun run db:generate
./ops/dev/codeline-dev.sh migrate
```

Seed deterministic local example data through the repository-owned command. It applies Drizzle migrations first, then reconciles the local-development user, two servers, three agents, three active sessions, one archived session, and finalized messages. Repeated default runs preserve unrelated rows; `--reset` removes and recreates only the known fixture-owned rows.

```bash
bun run db:seed
bun run db:seed -- --reset
```

Use the managed systemd user target for database, Zero, API, and UI verification. Do not start replacement services for seeding or browser checks:

```bash
./ops/dev/systemd/codeline-dev-systemd.sh status
systemctl --user restart codeline-dev.target
bun run db:seed
```

For repository-managed development startup, install and enable the user target:

```bash
./ops/dev/systemd/codeline-dev-systemd.sh install
systemctl --user enable --now codeline-dev.target
./ops/dev/systemd/codeline-dev-systemd.sh status
```

The target starts PostgreSQL before Zero Cache, then the Bun/Hono API on port `6001`, and finally the Vite UI on port `6000`. It waits for dependency health, API readiness at `/api/ready`, and the UI root; Vite's strict port check makes a UI port conflict fail the managed UI unit. The services load the ignored `.env`, run from the repository root, and restart on failure. It uses the user's default rootless Podman storage; it does not create Codeline-specific `/tmp` or `--root`/`--runroot` paths. Stop or remove it with `systemctl --user stop codeline-dev.target` or `./ops/dev/systemd/codeline-dev-systemd.sh remove`.

Troubleshooting:

- If configuration validation reports a missing variable, ensure `.env` exists and contains the required names from `.env.example`. The wrapper reports names only, never values.
- If `podman compose` is unavailable, install or configure a Podman Compose provider and retry `./ops/dev/codeline-dev.sh config`.
- If managed host ports `6000` through `6003` are busy, change the corresponding host variables in ignored `.env` and `DATABASE_URL`. Keep `VITE_ZERO_*`, `ZERO_QUERY_URL`, and `ZERO_MUTATE_URL` derived from `PUBLIC_ORIGIN`. Then reinstall/reload the user units.
- If Zero retains a stale replica after schema or database experiments, run `./ops/dev/codeline-dev.sh clean`, then start the managed target and remigrate/reseed.
- Inspect `./ops/dev/codeline-dev.sh logs postgres` and `./ops/dev/codeline-dev.sh logs zero-cache` for service diagnostics.

Example route checks:

```bash
curl http://127.0.0.1:6001/health
curl http://127.0.0.1:6001/api/sessions
curl -X POST http://127.0.0.1:6001/api/testing/echo \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}'
curl -N 'http://127.0.0.1:6001/api/testing/stream?scenario=normal'
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

Near-term work is release-readiness verification: documentation, local package validation, and automated end-to-end checks for the managed development services and protected application flows.

GitHub release artifacts, clean-clone/CI reproducibility for the local Zero and git-store links, and production deployment automation are intentionally deferred. Pi-web exclusions remain out of scope.

## License

MIT. See [LICENSE](./LICENSE).
