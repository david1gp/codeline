# PostgreSQL to SQLite

## Goal

Replace PostgreSQL with a single embedded SQLite database while continuing the HTTP/SSE architecture in `docs/20260822_http_sse_migration_plan.md`. Start from a fresh database; no PostgreSQL data migration, dual writes, or compatibility layer.

## Decisions

- Keep Drizzle and use the same SQLite stack as `~/leo/gruppenplan-app`: `@libsql/client`, `drizzle-orm/libsql`, and the Drizzle SQLite dialect.
- Store the database at `data/db.sqlite`; resolve an absolute `file:` URL for Drizzle Kit and runtime connections.
- Apply the Gruppenplan connection settings unchanged: `journal_mode=WAL`, `synchronous=normal`, `temp_store=memory`, `busy_timeout=5000`, `legacy_alter_table=OFF`, `mmap_size=134217728`, `journal_size_limit=27103364`, and `cache_size=2000`.
- Keep one module-owned database client in the managed API process. SQLite has no separate development service.
- Replace the PostgreSQL migration history with one fresh SQLite baseline generated from the converted schema.
- Flatten the PostgreSQL `identity` schema into prefixed SQLite table names.
- Store JSON in SQLite `text(..., { mode: "json" })`, dates as integer epoch milliseconds, booleans as integer-backed values, and journal sequences as safe integers.
- Serialize mutations with SQLite write transactions. Replace row locks and advisory locks with atomic counter updates and transaction-scoped read/check/write operations.
- Preserve the HTTP contracts, ETags, revisions, idempotency, journal cursors, publish-after-commit behavior, and SSE replay semantics from the current architecture plan.
- Remove Zero with PostgreSQL because Zero cannot use SQLite as its upstream. Continue the planned direct cutover to typed HTTP, SSE, and settled-session IndexedDB; do not redirect the architecture to Convex.

## Approach

Establish the SQLite runtime and baseline first, port persistence and transaction semantics domain by domain, switch the managed application and deterministic seed workflow to the SQLite file, then remove Zero and all PostgreSQL code and operations. Continue the remaining tasks in `docs/20260822_http_sse_migration_plan.md` against SQLite.

## Current status

SQLite/libSQL with Drizzle, typed HTTP, and authenticated SSE are the current runtime and managed operations architecture. PostgreSQL, Zero, and Convex references in this document and the dated feature plans are historical migration records, not active services, clients, or data authorities.

## Tasks

- [x] **1. Align the current architecture plan with SQLite**
  - Replace PostgreSQL-specific datastore, locking, migration, and operations decisions in `docs/20260822_http_sse_migration_plan.md` and its cutover matrix.
  - Keep the existing HTTP/SSE, journal, snapshot, run-lifecycle, and IndexedDB decisions unchanged.
  - Make SQLite the only durable server datastore in all remaining architecture tasks.

- [x] **2. Add the Gruppenplan SQLite runtime**
  - Replace `postgres` and `drizzle-orm/postgres-js` with `@libsql/client` and `drizzle-orm/libsql`.
  - Add a shared database URL/path module and connection factory modeled on `~/leo/gruppenplan-app/src/db/client/dbUrl.ts`, `src/db/client/db.ts`, and `src/utils/nodejs/openLibsql.ts`.
  - Apply the same PRAGMAs when opening the client; update close and readiness behavior for libSQL.
  - Update server configuration and `.env.example` to use `data/db.sqlite` instead of PostgreSQL connection settings.
  - Verify connection, restart persistence, typecheck, and database readiness tests.

- [x] **3. Convert the Drizzle schema and create a fresh baseline**
  - Convert every `pgTable`, PostgreSQL schema, `jsonb`, timezone timestamp, bigint, boolean, generated expression, index, foreign key, unique constraint, and check to its SQLite equivalent.
  - Prefix identity tables and update all schema references.
  - Store `journal_event.serializedBytes` in application code and add a nullable indexed `runId` column for run delta/finalization queries.
  - Change `drizzle.config.ts` to `dialect: "sqlite"` with an absolute `file:` URL and replace `src/database/migrations/` with one generated SQLite baseline.
  - Verify a clean migrate, schema constraints, foreign-key enforcement, JSON/date round trips, and `bun run db:check`.

- [x] **4. Port database types, transactions, and PostgreSQL SQL**
  - Replace PostgreSQL-specific database and transaction types with libSQL Drizzle types while preserving awaited transaction callbacks.
  - Port casts, `ILIKE`, JSON operators, generated SQL, schema-qualified names, `information_schema` checks, `FOR UPDATE`, and advisory locks.
  - Allocate journal sequences atomically inside SQLite write transactions and keep journal persistence, domain writes, idempotency records, and revisions in the same transaction.
  - Port session/server search, snapshots, message sequencing, run finalization, journal pruning, and conflict handling.
  - Verify concurrent sequence allocation, idempotency races, revision conflicts, rollback behavior, snapshot consistency, and publish-after-commit.

- [x] **5. Rebuild reset, migrate, and deterministic seed workflows**
  - Replace PostgreSQL schema reset with deletion of `data/db.sqlite`, `data/db.sqlite-wal`, and `data/db.sqlite-shm`, followed by migrate and seed.
  - Preserve the repository-owned reset lock, consumer stop order, deterministic fixture, idempotent seed behavior, and existing package command names.
  - Move organization bootstrap from PostgreSQL migration session settings into the seed/application workflow.
  - Port database-backed E2E setup scripts to the shared SQLite client.
  - Verify `db:reset-seed` twice from a clean checkout and run seed/API visibility tests serially.

- [x] **6. Cut active server persistence to SQLite**
  - Port identity, organizations, sessions, messages, notes, agents, servers, runs, streams, revisions, idempotency, and journal repositories to the SQLite client.
  - Make SQLite-backed typed HTTP routes and `/api/events` authoritative; remove database fallbacks and PostgreSQL-specific test skips.
  - Continue the domain cutover order in the current HTTP/SSE plan, deleting each replaced Convex path after its HTTP/SQLite replacement passes.
  - Verify authentication persistence, organization isolation, CRUD, snapshots, ETags, conflicts, idempotency, journal fan-out, replay/reset, and process restart behavior.

- [x] **7. Remove Zero before removing PostgreSQL runtime support**
  - Replace remaining Zero UI queries/mutations with the existing typed HTTP client and event feed.
  - Remove the Zero provider, schema, query/mutate routes, sync proxying, cache service, environment variables, scripts, dependencies, and tests.
  - Verify browser flows through the managed preview: sessions, search, messages, notes, parallel runs, reconnect/reset, authentication expiry, and no Zero WebSocket/query/mutate traffic.

- [x] **8. Remove PostgreSQL operations and finish the cutover**
  - Remove PostgreSQL client dependencies, migrations, reset helpers, target checks, container/volume definitions, systemd dependencies, environment variables, ports, and documentation references.
  - Make the managed API service own the SQLite file and ensure the repository ignores `data/db.sqlite*`.
  - Remove superseded PostgreSQL and Convex persistence code once no active import or runtime branch references it.
  - Run the serial database, identity, HTTP, journal/SSE, and UI tests; then typecheck, build, reset-seed, managed-service restart, and browser verification.

## Paths

- Architecture: `docs/20260822_http_sse_migration_plan.md`, `docs/20260822_http_sse_cutover_matrix.md`
- Reference SQLite setup: `~/leo/gruppenplan-app/drizzle.config.ts`, `~/leo/gruppenplan-app/src/db/client/`, `~/leo/gruppenplan-app/src/utils/nodejs/openLibsql.ts`
- Database: `drizzle.config.ts`, `src/database/`, `src/**/db/`
- Runtime: `src/server/serverStart.ts`, `src/app/`, `.env.example`, `package.json`
- Workflows: `scripts/dbReset.ts`, `scripts/dbSeed.ts`, `scripts/managedDatabase*`, `scripts/e2e*`
- Operations: `ops/dev/codeline-dev.sh`, `ops/dev/systemd/`, `ops/dev/caddy/`
- HTTP/SSE: `src/api/`, `src/events/`, `src/journal/`, `src/stream/`
- Current clients: `src/ui/`, `src/api/`, `src/events/`
- Historical cleanup references: dated migration and feature-plan records under `docs/`; no active PostgreSQL, Zero, or Convex client paths remain. Empty legacy directories are non-operational.
- Tests and workflows: `test/`, `e2e/`, and the `test`, `test:integration`, `test:e2e`, `typecheck`, `build`, `db:check`, and `db:reset-seed` scripts in `package.json`
