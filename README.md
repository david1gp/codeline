# @adaptive-ds/codeline

Codeline is an AI coding workspace built for the fastest possible UI/UX. Its foundation is a server-authoritative SQLite database with typed HTTP reads and mutations plus a replayable SSE event feed, so the interface stays durable, responsive, and easy to inspect.

The goal is AI coding that does not suck: instant feedback, durable application state, and a focused workspace that stays out of the way.

- **Typed reads and mutations** — validated HTTP contracts keep server state authoritative and responses predictable
- **Incremental live updates** — replayable SSE events invalidate or update client state without polling
- **Fine-grained rendering** — SolidJS and `@adaptive-ds/solid-ui` update only the UI affected by those changes
- **Durable server state** — SQLite/libSQL and Drizzle own application data in the managed API process
- **Explicit boundaries** — Hono, Valibot, typed HTTP, SSE, and TanStack AI provide validated transport seams
- **Simple toolchain** — Bun and TypeScript power development, testing, and production builds

Quick Links

- site - http://codeline.work/
- code - https://github.com/david1gp/codeline
- issues - https://github.com/david1gp/codeline/issues
- solid-ui - https://github.com/david1gp/solid-ui

## Status

Codeline is a runnable AI coding workspace. It provides synchronized session navigation, provider-backed chat execution, durable messages and execution events, stream replay, bounded retries and subagents, project/file browsing, Git branch controls, Markdown rendering, provider/model selection, simulation fixtures, and a responsive `/demo` showcase. It also includes provider-neutral OIDC/PKCE authentication, protected UI state, HTTP/SSE account isolation, and an installable PWA baseline.

The Hono API persists durable state in SQLite through Drizzle. Typed HTTP synchronizes authorized reads and mutations with the browser, while the replayable SSE event feed carries server-to-client changes. The chat runtime supports deterministic fixtures and the configured local CLIProxyAPI/Codex-LB provider targets.

SQLite/libSQL with Drizzle, typed HTTP, and authenticated SSE are the sole current data and operations architecture. Former migration systems appear only in dated migration or feature-plan records and are not active services or data authorities.

Local development uses a pinned git-store checkout through a Bun link. `bun run release` runs the local format, test, and build preflight; `bun run build` runs the build directly; and `bun run deploy` stages a build, swaps it into the managed preview checkout, restarts the repository-managed target, and verifies readiness with guarded prior-build rollback on failure. GitHub release artifacts and clean-clone/CI reproducibility remain deferred.

Provider OAuth, Pi ecosystem integrations, MCP, full-text web search, custom scrollbar behavior, trusted folders / project trust, editing or limiting AI capabilities, and AI permission management are out of scope.

## Source Layout

The repository root contains checked-in provider model definitions and agent configurations alongside application source code:

```txt
providers/
├── cliproxyapi/{model}.yml
└── codex-lb/{model}.yml
agents/
└── {name}.md
src/
├── identity/{api,db}
├── servers/{api,actions,db,schema}
├── agents/{actions,api,db,schema}
├── session/{api,actions,db,schema}
├── message/{api,actions,db,schema}
├── stream/db
├── database/
├── api/
├── app/
├── configuration/
├── providers/{api,catalog,runtime,schema,ui}
├── server/
└── ui/
```

- `providers/{provider}/{model}.yml` defines provider model metadata, connection parameters, capabilities, costs, and effort variants.
- `agents/{name}.md` defines primary agents and subagents via YAML frontmatter and Markdown prompt bodies.
- `schema/` holds Valibot request and query contracts for that context.
- `api/` holds Hono route registration only.
- `actions/` holds application operations such as `sessionCreate` and `serverList`.
- `db/` holds Drizzle tables and repositories.
- `database/` holds shared persistence infrastructure only: the client, transactions, migrations, and `databaseSchema.ts`.
- `api/` at the top level holds platform HTTP only: health, readiness, errors, testing, and route composition.
- `server/` is the HTTP process. The server domain context is `servers/`.

HTTP paths can nest across contexts. Agent routes stay at `/servers/:serverId/agents` and message routes stay at `/sessions/:sessionId/messages`; the owning context still registers them.

## Implemented Routes

Health and readiness:

- `GET /health` and `GET /api/health` return the Codeline health response.
- `GET /api/ready` reports process readiness.

Workspace and catalog data:

- `GET /api/servers` and `GET /api/servers/:serverId/agents`
- `GET /api/servers/:serverId/agents/:agentId`, `POST /api/servers/:serverId/agents`, `PATCH /api/servers/:serverId/agents/:agentId`
- `POST /api/servers/:serverId/agents/models`, `POST /api/servers/:serverId/agents/connection-test`
- `POST /api/servers/:serverId/agents/:agentId/models`, `POST /api/servers/:serverId/agents/:agentId/connection-test`
- `GET /api/providers/catalog` (returns redacted catalog providers, models, and agents)
- `POST /api/providers/models`, `POST /api/providers/connection-test`
- `GET /api/sessions`, `POST /api/sessions`
- `GET /api/sessions/:sessionId`, `PATCH /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/archive`, `DELETE /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/messages`, `POST /api/sessions/:sessionId/messages`

Test seams:

- `POST /api/testing/echo` accepts `{ "message": "..." }` and rejects an empty or invalid message with a structured `400`.
- `GET /api/testing/errors/bad-request` and `GET /api/testing/errors/internal-server-error` return deterministic structured errors.
- `GET /api/testing/stream` returns `text/event-stream` events with sequential IDs. `scenario` is `normal`, `error`, `unexpected-end`, or `idle-timeout`; optional `delayMs` and `idleTimeoutMs` values must be between 1 and 60000 milliseconds.

## Provider and Agent Catalogs

Codeline defines provider models and agent configurations through checked-in filesystem files in the repository root.

### Provider Model Catalog (`providers/{provider}/{model}.yml`)

- **ID and File Naming**:
  - Provider ID derives from the parent directory name `providers/{provider}` (`cliproxy` normalizes to `cliproxyapi`). IDs use lowercase alphanumeric characters, dots, underscores, and hyphens (`[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?`).
  - Model ID derives from the filename stem `{model}.yml`. This exact model ID is used for execution and selection. If specified in YAML, `model:` must match the filename stem.
- **Provider Connection Agreement**: Every model file is self-contained. All files within a provider directory must agree on provider-level settings (`baseUrl`, `apiKey`, `env`, `transport`, `providerOptions`, `providerDisplayName` / `name`, `providerEnabled` / `enabled`).
- **Environment-Reference Credentials**: Credentials (`apiKey`, `env`, or nested `options.apiKey`) must use uppercase environment variable references (e.g. `apiKey: $CODEX_LB_API_TOKEN`, `env: [$SUBS_CONTENTOREN_DE_API_KEY]`). Literal secret values are never committed or exposed via API responses; secrets resolve at execution time from server environment variables.
- **Transports and Disabled Models**: Supported transports are `openai/completions` and `openai/responses`. Other transport metadata, including `aisdk` and `anthropic/messages`, remains cataloged, but models using those transports are disabled for execution and selection until a matching adapter exists. Models explicitly set to `enabled: false` / `disabled: true` are also disabled.
- **Model Metadata**:
  - `name`: Display name (defaults to the model ID).
  - `family`: Optional model family string (e.g. `gpt-5.6`).
  - `status`: Lifecycle status (`active`, `alpha`, `beta`, `deprecated`; defaults to `active`).
  - `reasoning`: Boolean indicating reasoning capability.
  - `limit`: Context window and output limits (e.g. `context: 272000`, `output: 128000`, optional `input`).
  - `modalities` / `capabilities`: Modality arrays for `input` and `output` (e.g. `[text, image]`), and `tools` boolean.
  - `cost`: Tiered pricing array with `input`, `output`, `cacheRead`, `cacheWrite`, and optional context tier (`tier: { type: "context", size: 200000 }`).
  - `variants`: Array of model variants defining reasoning effort (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`) and variant-specific `options`.

### Agent Catalog (`agents/{name}.md`)

- **ID and File Naming**: Agent ID derives from the filename stem `agents/{name}.md`.
- **Frontmatter**:
  - `description`: Agent purpose and role summary.
  - `mode`: `primary` (direct implementation) or `subagent` (delegated execution; default).
  - `model`: Model reference (e.g. `codex-lb/gpt-5.6-sol` or `gpt-5.6-luna`). If omitted, inherits the project catalog default.
  - `provider`: Optional provider ID override.
  - `variant` / `effort`: Model variant or reasoning effort choice (`low`, `medium`, `high`, `xhigh`, `max`).
  - `permission`: Bounded nested permission rules (`allow`, `ask`, `deny`) for actions like `task` and `question`.
  - `generation`: Optional transport-supported generation parameters (e.g. `reasoningEffort`). Stale or unsupported generation defaults (such as arbitrary `maxTokens: 100000` or `temperature: 0.7`) are omitted.
  - `enabled`: Boolean availability (defaults to `true`).
- **Markdown Body**: The non-empty system prompt defining the agent's instructions, role, and workflow.

### UI Grouped Selector Behavior

The session model selector organizes available models into non-selectable provider group headers (e.g. `codex-lb`, `cliproxyapi`) with selectable model items underneath. Reasoning effort controls dynamically populate choices based on the selected model's configured `variants`.

### Deterministic Seed and Reconcile

Catalog models and agents are deterministically loaded, SHA-256 revisioned, and compiled into the Git-backed configuration store under `example-server-local` during seeding:

```bash
bun run db:seed
```

## Local Development

Requirements: Bun 1.3 or newer, user systemd, and `git`.

```bash
bun install
cp .env.example .env
chmod 600 .env
./ops/dev/git-store-link.sh setup
./ops/dev/codeline-dev.sh validate
```

The managed preview stack includes one compiled Bun service serving the SQLite-backed API, SSE, and built UI. Use the wrapper below for lifecycle and database operations; do not start replacement services outside the managed unit.

### Concurrent Authworks and Zitadel SSO

OIDC mode accepts explicit `OIDC_AUTHWORKS_*` and `OIDC_ZITADEL_*` namespaces, so Authworks and Zitadel can be configured at the same time. Each configured provider needs an issuer, client ID, and its own non-secret resource-owner organization ID. Set `OIDC_ORGANIZATION_ID` to the local Codeline organization external ID shared by both providers. Each OIDC client must register the exact shared callback `https://preview.codeline.work/api/auth/callback`; do not register provider-specific callback paths, query strings, or fragments. The `openid profile email` scopes are requested. Zitadel also receives the `urn:zitadel:iam:user:resourceowner` scope because its discovery document does not advertise this provider-specific scope; other providers receive it when discovery advertises it.

The resource-owner claim name is shared: both providers emit `urn:zitadel:iam:user:resourceowner:id`, but each claim must equal that provider's configured `OIDC_AUTHWORKS_ORGANIZATION_ID` or `OIDC_ZITADEL_ORGANIZATION_ID`. After issuer-scoped validation, Codeline maps either accepted provider ID to `OIDC_ORGANIZATION_ID`. The client ID identifies the OIDC application; it does not establish organization membership. Authenticated members of that local organization share access to Contentoren's configured servers and enabled execution agents.

When more than one provider is configured, `/api/auth/login` requires exactly one `provider=authworks` or `provider=zitadel` query value. An omitted provider remains valid when exactly one provider is configured; unknown or duplicate provider values are rejected. The callback uses the issuer saved in the short-lived OIDC transaction to select discovery and callback credentials. Any callback `provider` query value is ignored, so it cannot switch credentials after the transaction is created.

Existing single-provider configuration remains compatible through the provider-neutral `OIDC_*` names and the legacy `ZITADEL_*` aliases. In that mode, `OIDC_ORGANIZATION_ID` (or its legacy provider alias) may continue to serve as both the accepted provider ID and local organization ID. Do not set conflicting aliases. Seed and E2E environment resolution prefers `OIDC_ZITADEL_ISSUER`/`ZITADEL_ISSUER`, then `OIDC_AUTHWORKS_ISSUER`, then `OIDC_ISSUER`; differing provider IDs require the explicit local `OIDC_ORGANIZATION_ID`. See [.env.example](./.env.example) for placeholders only.

Both providers produce the same Codeline session behavior: a successful callback creates an opaque, host-only Codeline session (normally valid for twelve hours), and provider access tokens are not persisted. Existing sessions are authorized against memberships from any configured provider issuer. Sessions, messages, notes, runs, and streams remain private to the application user who created them; organization membership grants shared server access, not shared personal session data.

Project discovery roots are configured with `CODELINE_PROJECT_ROOTS` as a JSON string array. Omit the variable, or leave it blank, to discover projects from the operating-system home directory. Set it to an explicit empty array (`[]`) to disable project discovery. Relative roots are normalized from the Codeline process working directory and duplicate roots are removed.

For example, configure multiple roots with:

```dotenv
CODELINE_PROJECT_ROOTS=["./projects","../shared-projects"]
```

The managed preview service listens at `127.0.0.1:6001`, owns the repository-local `data/db.sqlite` file, and serves the compiled UI alongside typed HTTP and `/api/events` SSE. Vite remains the local UI development and build tool.

`ops/dev/caddy/Caddyfile` contains the single preview route directly to the combined service. Register that route through the host project-registry during cutover; this repository does not reload Caddy.

Set up or verify the local git-store link:

```bash
bun run git-store:link
bun run git-store:verify
```

The link script installs and builds the clean sibling checkout at `../git-store-clean-779c05b`, runs `bun link` in that checkout, and links `@adaptive-ds/git-store` into Codeline. Set `GIT_STORE_CHECKOUT` in the environment or ignored `.env` to use another local checkout. Configuration writes always use `autoPush: false`; this setup does not add or use remote pushes.

This is a local-checkout workflow and is not reproducible from a clean Codeline clone or CI. A clean clone needs the git-store checkout, its built `dist/`, and the local Bun link before Codeline dependencies and checks can resolve.

Verify the immutable release inputs without network access:

```bash
bun run release:inputs:verify
```

This checks the linked git-store target, including its Git revision, cleanliness, package identity, exports, and required build outputs. It reports a blocker when a provisioned source directory cannot prove its Git provenance.

GitHub release artifacts and clean-clone/CI dependency reproducibility are deferred. Typecheck, tests, build, database checks, and release-input verification remain local commands after the git-store link is established.

Service lifecycle:

```bash
./ops/dev/codeline-dev.sh validate
./ops/dev/codeline-dev.sh install
bun run deploy
./ops/dev/codeline-dev.sh wait api
./ops/dev/codeline-dev.sh status
./ops/dev/codeline-dev.sh logs codeline-dev-api.service
./ops/dev/codeline-dev.sh stop
./ops/dev/codeline-dev.sh db-reset-seed
./ops/dev/codeline-dev.sh remove
```

`install` only links the repository-managed user units, removes the stale Vite unit link, and reloads user systemd; it does not enable or start anything. `bun run deploy` is the managed build-and-restart workflow: it works when no `dist` exists, keeps the prior build until the staged build is ready, restores a prior build only after successfully stopping the target and then confirms target/API readiness, and leaves a failed first deployment with no prior build stopped after removing the failed build. If the target cannot be stopped for recovery, the deploy fails without claiming restoration and does not confirm the build or service state. `start` starts that target when a compiled build already exists. `stop`/`down` stop the target while retaining data. `db-reset-seed` stops the managed API consumer, resets the SQLite file, runs Drizzle migrations, and seeds deterministic fixtures. `reset` is an alias for that full SQLite reset workflow.

```bash
bun run db:migrate
bun run db:generate
bun run db:migrate
```

Seed deterministic local example data through the repository-owned command. It applies Drizzle migrations first, reconciles the Contentoren organization from the shared OIDC organization aliases, assigns two stable servers to it, keeps the local-development user for private fixture sessions and messages, and reconciles catalog provider models and agents from `providers/` and `agents/` into the Git-backed configuration store under `example-server-local`. Repeated default runs preserve unrelated rows; `--reset` removes and recreates only the known fixture-owned rows. If an OIDC fixture identity is configured, the seed uses the deterministic issuer precedence documented above.

```bash
bun run db:seed
bun run db:seed -- --reset
```

The target starts the compiled Bun/Hono preview service and waits for readiness at `/api/ready`. The service loads the ignored `.env` file, runs from the stable `~/codeline` checkout link, and restarts on failure. `bun run start` runs the compiled API directly without a watch process; use `bun run deploy` for the managed preview lifecycle.

Troubleshooting:

- If configuration validation reports a missing variable, ensure `.env` exists and contains the required names from `.env.example`. The wrapper reports names only, never values.
- If the managed host port is busy, fix the conflicting service before cutover. Preview routing expects `preview.codeline.work` to map to the combined service on port `6001` in `ops/dev/caddy/Caddyfile`.
- Inspect `./ops/dev/codeline-dev.sh logs codeline-dev-api.service` for diagnostics.

Example route checks:

```bash
curl http://127.0.0.1:6001/health
curl http://127.0.0.1:6001/api/sessions
curl -X POST http://127.0.0.1:6001/api/testing/echo \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello"}'
curl -N 'http://127.0.0.1:6001/api/testing/stream?scenario=normal'
```

## End-to-end tests

Browser verification is outside this operations-only step. Do not replace the managed services or start ad-hoc development servers while verifying them.

The run mutates local development data. It creates two run-unique synthetic organization members, their identity sessions, and one conversation per member through the regular API, then deletes those users again in a teardown that also runs after a failed assertion; the cascading delete removes the generated memberships, identity sessions, conversations, messages, runs, notes, and stream rows. Seeded example data is untouched, and repeated runs stay independent because every run uses a fresh identifier.

The setup and cleanup scripts refuse to run unless `NODE_ENV`, `PUBLIC_ORIGIN`, and `DATABASE_URL` match the repository-managed SQLite file at `data/db.sqlite`. Any other connection string aborts the run before a write happens. A configured OIDC issuer and shared organization ID must also resolve from the explicit or legacy names in `.env`, as documented in `.env.example`; the synthetic members are created against the deterministically selected issuer and shared organization, and a missing or conflicting value aborts the run. To remove a run's data manually after an interrupted run, use its identifier:

```bash
bun scripts/e2eOrganizationMemberSessionsPurge.ts <run-id>
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

GitHub release artifacts, clean-clone/CI reproducibility for the local git-store link, and production deployment workflows remain future work. The repository-managed local preview deployment is implemented by `bun run deploy`. Pi-web exclusions remain out of scope.

## License

MIT. See [LICENSE](./LICENSE).
