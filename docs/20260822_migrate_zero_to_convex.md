# Migrate Zero to Convex

## Goal

Replace Zero, PostgreSQL, and Drizzle with Convex as Codeline's canonical application datastore and reactive client backend, while preserving authentication, authorization, sessions, notes, execution streaming, deterministic example data, and existing user-visible behavior. Remove every Zero-specific runtime, endpoint, dependency, service, environment variable, test, and operational path after cutover.

## Decisions

- Before migration work begins, stop and disable every Codeline development server, service, target, and timer; remove the installed and checked-in legacy development systemd units and keep the development stack offline until the Convex-only stack is ready for final activation.
- Follow `~/leo/allgroups-chat`: self-host Convex, run function deployment through a repository-managed systemd user service, compose `convex/schema.ts` from domain-owned table modules, keep public Convex entrypoints thin, and use generated `#convex/_generated/*` APIs.
- Convex becomes the sole owner of all currently PostgreSQL-backed application and identity data. PostgreSQL remains only as a temporary migration source and is removed with Drizzle after validated cutover.
- Preserve stable application-facing ID, ordering, relationship, enum, and JSON contracts in the new Convex model instead of exposing Convex document IDs to application state or URLs.
- Keep the existing OIDC and development-login user experience, but persist users, external identities, organization membership, login transactions, and identity sessions in Convex. Convex functions derive identity from trusted session credentials and never authorize from a client-supplied user ID.
- Move all durable reads and writes into domain-owned Convex queries, mutations, and actions. Existing Hono routes remain only where Node-local capabilities are required, such as provider processes, filesystem/project access, Git, and SSE transport; those routes call Convex for persistence.
- Preserve SSE for live provider execution during the migration. Convex subscriptions replace Zero materialization for durable messages, runs, attempts, delegations, events, and checkpoints; the UI continues reconciling transient SSE state with durable records by stable IDs and sequence numbers.
- Port note ordering into atomic Convex mutations and replace expanding Zero session queries with indexed Convex pagination while retaining current list ordering and load-more behavior.
- Existing data may be discarded. Do not build data export, transformation, import, dual-write, snapshot, or rollback tooling; initialize Convex from deterministic repository-owned fixtures and catalog seed functions.
- Do not maintain a permanent Zero/Convex dual-write path. Temporary parity tooling may compare reads, but cutover switches each dependency-ordered vertical slice to Convex ownership.
- Generated Convex files are produced by explicit package commands; secret/admin credentials stay server-side and public Convex URLs are validated separately.

## Approach

1. Shut down the current development stack and remove its legacy systemd services, targets, timers, and installation wiring before changing persistence code.
2. Build the self-hosted Convex backend, dashboard, function deployer, environment contract, generated API aliases, and Solid client context while leaving all development servers stopped.
3. Define the complete Convex schema and shared authorization/model boundaries, then add deterministic reset and seed tooling before moving features.
4. Migrate persistence bottom-up: identity and organizations; servers and agents; sessions and notes; messages, runs, attempts, delegations, stream events, and checkpoints.
5. Replace UI Zero subscriptions and mutations with Convex-native reactive state, preserving loading, stale-data, pagination, reconnect, and transient-stream reconciliation behavior.
6. Validate non-server contracts, reset and seed Convex, install and activate the new Convex-only managed stack, run browser verification, then remove remaining Zero and PostgreSQL/Drizzle infrastructure.

## Tasks

- [x] **1. Stop development and remove legacy service automation.** Stop and disable `codeline-dev.target` and every Codeline development service and timer, uninstall their user-systemd units, remove the checked-in legacy units, timers, installers, and obsolete service orchestration under `ops/dev/systemd/`, and keep API, UI, PostgreSQL, and Zero Cache stopped for the rest of the migration.
- [x] **2. Add the Convex platform baseline.** Add the Convex dependency and commands, `convex/tsconfig.json`, generated-code aliases, a compositional `convex/schema.ts`, thin domain entrypoints, a Solid `ConvexClient` context/provider, and public/server environment validation modeled on `~/leo/allgroups-chat`.
- [x] **3. Prepare Convex-only managed development operations.** Define replacement self-hosted backend, dashboard, API, UI, and function-deployment services with persistent volumes, health checks, reset/status commands, preview-origin routing, and `.env.example`; do not install or start them until final cutover.
- [x] **4. Model the complete Convex data schema.** Port users, external identities, identity sessions, OIDC transactions, organizations, memberships, servers, agents, sessions, messages, notes, runs, attempts, delegations, stream events, and checkpoints into domain-owned table/validator modules with indexes for every existing lookup, uniqueness rule, ordering, pagination cursor, idempotency key, and relationship.
- [x] **5. Implement shared Convex identity and authorization.** Add trusted session resolution and reusable user/organization ownership guards for query, mutation, action, and HTTP contexts; port development identity and OIDC persistence while preserving secure cookies, issuer/subject linkage, membership checks, login/logout, and session expiry behavior.
- [x] **6. Build deterministic reset and seed tooling.** Port checked-in example fixtures and provider/agent catalog reconciliation to idempotent internal Convex mutations; add local reset/seed commands and verify fixture counts, references, uniqueness, ordering, and rerun safety. Do not migrate existing PostgreSQL data.
- [x] **7. Migrate servers and agents.** Replace their Drizzle repositories and database-backed Hono handlers with Convex functions/actions while preserving organization visibility, catalog reconciliation, hierarchy, search/list behavior, and provider execution contracts.
- [x] **8. Migrate sessions and notes.** Add authorized indexed session detail/list/search/create/update/archive/pin/delete functions and atomic note create/update/delete/reorder functions; switch corresponding API/UI state to Convex subscriptions and mutations with stable pagination and stale-data behavior.
- [x] **9. Migrate messages and execution state.** Move message, run, attempt, delegation, stream-event, and checkpoint writes/reads to Convex; preserve transaction boundaries, client-request idempotency, status transitions, sequence ordering, replay checkpoints, cancellation, retry, and parent/subagent relationships.
- [x] **10. Integrate Convex with provider execution and SSE.** Replace database repositories used by run orchestration and stream replay with Convex calls, keep filesystem/provider work in the API process, and preserve exact-once convergence between transient SSE events and subscribed durable Convex data.
- [ ] **11. Remove the Zero client and protocol.** Replace `CodelineZeroProvider`, `codelineQueries`, note mutators, `useZero`/`useQuery` state, connection/materialization diagnostics, `/api/query`, `/api/mutate`, `/sync`, and all Zero-specific error/status wording with Convex equivalents.
- [ ] **12. Convert offline verification.** Replace Zero/Drizzle tests with Convex schema, authorization, query, mutation, seed/reset, pagination, reconnect, and stream-reconciliation tests; convert E2E setup/cleanup helpers to admin-only Convex functions, but defer managed-service and browser execution until cutover.
- [ ] **13. Reset and cut over.** Delete existing development data, deploy Convex functions, initialize Convex from deterministic fixtures and catalogs, switch UI/API configuration, and do not restart the legacy stack.
- [ ] **14. Delete obsolete persistence and operations.** Remove `@rocicorp/zero`, Drizzle, PostgreSQL clients, schemas, migrations, repositories, Zero updater/linker code, cache and PostgreSQL containers/volumes, logical-replication configuration, old environment variables, obsolete tests/docs, and release-input references; update `README.md` and `AGENTS.md` for Convex-only operation.
- [ ] **15. Activate and verify the Convex-only stack.** Install and start only the replacement managed Convex, API, and UI services, verify health and preview-origin routing, seed a clean development deployment, run the full browser suite including reconnect and multiple-tab streaming, and confirm no browser or server traffic reaches Zero or PostgreSQL.

## Paths

- Convex platform: `convex/schema.ts`, `convex/tsconfig.json`, `convex/http.ts`, `convex/*.ts`, `convex/_generated/`, `package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`
- Domain Convex modules: `src/identity/convex/`, `src/servers/convex/`, `src/agents/convex/`, `src/session/convex/`, `src/message/convex/`, `src/note/convex/`, `src/run/convex/`, `src/stream/convex/`
- Client integration: `src/ui/ApplicationRoot.tsx`, `src/ui/CodelineZeroProvider.tsx`, `src/ui/codelineQueries.ts`, `src/ui/*StateCreate.ts`, `src/note/ui/*StateCreate.ts`, `src/identity/ui/`
- API and execution integration: `src/api/apiRoutesAdd.ts`, `src/api/query/`, `src/api/mutation/`, `src/identity/api/`, `src/session/api/`, `src/run/api/`, `src/stream/api/`, `src/stream/actions/`, `src/providers/`
- Retired persistence: `src/database/`, `src/**/db/`, `drizzle.config.ts`, `scripts/dbSeed.ts`
- Seed/reset tooling: `src/database/exampleDataFixture.ts`, `src/database/exampleDataSeed.ts`, `src/database/exampleDataConfigurationReconcile.ts`, `scripts/`, `providers/`, `agents/`
- Managed operations: `ops/dev/convex/`, `ops/dev/caddy/`, `ops/dev/codeline-dev.sh`, `ops/dev/systemd/`, `ops/dev/zero/`, `ops/dev/zero-link.sh`, `.env.example`, `ops/deploy.sh`, `ops/release.sh`
- Verification and docs: `test/`, `e2e/`, `playwright.config.ts`, `README.md`, `AGENTS.md`, `docs/20260818_zero-slow-query-materialization.md`, `docs/20260818_zero-session-pagination-diagnostics.md`, `docs/20260821_zero_head_update_timer.md`
