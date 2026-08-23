# HTTP + SSE data layer migration

This document records the completed replacement of the legacy Zero/Convex paths and the remaining HTTP/SSE hardening work. SQLite/libSQL with Drizzle, typed HTTP, and authenticated SSE are the current architecture; legacy names below are historical cleanup context only.

Historical predecessor plans:

- `docs/20260822_migrate_zero_to_http_sse.md`
- `docs/20260822_http_sse_data_layer.md`
- `docs/20260822_migrate_zero_to_convex.md`

## Goal

Replace Zero and the partial Convex migration with a server-authoritative data layer inside the existing Hono application. SQLite/libSQL with Drizzle is the durable source of truth; typed JSON HTTP handles reads and mutations; one replayable SSE feed per tab carries server-to-client changes; and IndexedDB provides device-local, read-only access to settled sessions.

Filesystem access, Git, shells, provider processes, credentials, path authorization, run execution, persistence, and synchronization stay in the Codeline server. The target deployment has exactly one API process.

## Why

- Codeline requires `fs`, Git subprocesses, and agent CLI processes. Convex cannot replace the Hono server and would leave two stateful server systems.
- Zero and the partial Convex migration move important failures into asynchronous browser synchronization paths that are difficult to diagnose.
- Plain HTTP, conditional requests, SSE, SQLite/libSQL, and a small client cache provide the required behavior without a general client transaction engine or WebSocket RPC layer.

## Architecture decisions

### Server and transport

- Keep Hono as the application boundary and SQLite/libSQL with Drizzle as the only durable datastore. Remove Zero and Convex from the target architecture.
- Do not operate Zero/Convex data, configuration, compatibility layers, generated code, tests, fixtures, tooling, services, or volumes. Their former paths are retained below only as cleanup history; SQLite/libSQL with Drizzle domain data remains authoritative.
- Run one API process. It owns provider execution, the active-run registry, live SSE fan-out, and all journal-producing writes. Do not add horizontal scaling, a cross-process publication mechanism, a general WebSocket RPC layer, or cross-tab connection sharing in this migration.
- Use plain JSON HTTP `GET` requests for reads and `POST`/`PATCH`/`DELETE` for mutations. Commands never travel through SSE.
- Use keyset pagination for lists. Session lists key on `(updatedAt, id)` and message-list endpoints key on `messageTable.sequence`; do not add offset pagination.
- Use one authenticated, same-origin `EventSource` per tab at `GET /api/events`. The session cookie is attached automatically. Parallel sessions share that multiplexed connection.
- SSE is carried over HTTP, not WebSocket. Send `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, and an idle heartbeat every 15 seconds.

### HTTP contracts, revisions, and caching

- Define request and response contracts with shared Valibot schemas in their bounded contexts. Validate every HTTP boundary and use stable public IDs rather than database implementation IDs.
- Every cacheable representation has an explicit integer revision. Increment it transactionally whenever any data included in that representation changes. Do not use `updatedAt` as a strong representation version unless it is guaranteed to change for every included value.
- Derive strong `ETag` values from representation identity, schema version, and revision. Honor `If-None-Match` with `304 Not Modified`.
- Cacheable authenticated responses use `Cache-Control: private, no-cache` and `Vary: Cookie, Accept-Encoding`. Compress complete session snapshots.
- Use `If-Match` and `412 Precondition Failed` for edits or deletes where a stale mutation could overwrite a concurrent change. Return structured conflict responses.
- Use client-generated idempotency keys for prompt submission and other retryable create/action mutations. Store the key and result transactionally with the mutation.
- Keep optimistic client behavior limited to prompt submission. Do not add a general optimistic mutation, rebase, or offline mutation framework.

### Complete settled-session snapshots

- A settled session is a session with no active run. It may become active again later.
- Fetch a settled session as one complete JSON HTTP response, not as IndexedDB manifest/page records and not through SSE transcript delivery.
- `GET /api/sessions/:sessionId/snapshot` returns the complete authoritative payload, representation revision, schema version, `ETag`, and the authenticated user's `asOfSequence` from one consistent database snapshot.
- On an IndexedDB hit, render the stored payload immediately and request the snapshot with `If-None-Match`:
  - `304`: retain the existing IndexedDB record.
  - `200`: atomically replace the complete IndexedDB record.
- When a run completes, or completion is discovered during later reconciliation, fetch this authoritative snapshot, replace assembled live state, and cache it atomically.

### Per-user journal sequencing

- Maintain one durable journal and one monotonic sequence per `applicationUser.id`. The scope is the application user, not the login session, organization, device, tab, session, or run.
- Allocate sequences through atomic per-user counter updates inside the same SQLite write transaction as the domain mutation and journal insert. Use transaction-scoped read/check/write operations; do not rely on database locks, a global sequence, or an in-process serialization queue for commit ordering.
- For an organization resource shared by multiple users, append an independently sequenced event to every currently authorized user's journal in the domain transaction. Process users in a deterministic order so counter updates have stable ordering.
- Publish events only after their transaction commits. A rolled-back transaction publishes nothing and does not advance the per-user sequence.
- Treat the SSE event ID as an opaque same-user cursor containing the user's journal identity and sequence. Reject a cursor belonging to another user's journal.

### Snapshot/feed race freedom

- Bootstrap from a conditional shell/list HTTP snapshot. Its body or `304` decision and `asOfSequence` must come from the same consistent database snapshot.
- After bootstrap, open the authenticated user's SSE feed after that `asOfSequence` using `?after=`. On automatic reconnect, `Last-Event-ID` takes precedence.
- Within the SSE endpoint, subscribe to live publication before reading the backlog, then deduplicate by sequence. Reading the backlog first would lose events published in between.
- Do not persist a standalone global feed cursor in IndexedDB or `localStorage`. Each tab keeps only its current in-memory connection cursor. Cached session records keep the `asOfSequence` describing their own snapshot.

### SSE frames and active deltas

- Send exactly one JSON event per SSE frame. Do not add JSONL or replay batch frames.
- Named event types are:
  - `invalidate` — identifies a changed resource and its new revision; the client revalidates it over HTTP when its cached revision is older.
  - `delta` — carries incremental output for an active run.
  - `run-completed` — compact completion checkpoint containing the run/session identity and final session revision; it supersedes that run's deltas and causes an authoritative HTTP snapshot fetch.
  - `run-failed`, `run-cancelled`, and `run-interrupted` — lifecycle checkpoints that cause active state reconciliation.
  - `reset` — states that the supplied cursor is no longer recoverable and requires HTTP reconciliation.
- Coalesce active-run fragments independently by run, message, and delta kind with a configurable 500ms default.
- Flush the first fragment immediately, flush at the serialized size boundary, and flush before every lifecycle event. Batch browser rendering separately from producer coalescing.
- Limit each serialized UTF-8 event to 128 KiB before compression.
- Cap queued output for one connection at 1 MiB or 1,024 events. If either limit is reached, or a write remains blocked for 15 seconds, disconnect the client so it can recover through replay rather than dropping sequenced events.

### Delta compaction and 12-hour replay

- Persist active-run deltas before publication so an attached client can recover from a short disconnect while the run remains active.
- Finalize a run in one transaction:
  1. Flush the producer buffer.
  2. Store the complete authoritative message or terminal partial result.
  3. Store the terminal run status.
  4. Increment affected representation revisions.
  5. Delete that run's now-obsolete persisted delta events.
  6. Append the compact terminal lifecycle event, including the authoritative resource revision.
- Publish the terminal event only after that transaction commits. A reconnecting client does not need deleted deltas: the terminal event causes it to fetch the complete message through HTTP.
- Intentional sequence gaps from finalized-run delta deletion are valid. The client applies available events in order but does not infer corruption from numeric non-contiguity; the server decides whether a cursor is recoverable.
- Retain compact completion, failure, cancellation, interruption, and invalidation events for at most 12 hours, 500,000 events, or 512 MiB per user, whichever limit is reached first. Prune oldest compact events without reusing sequence numbers.
- If the server can no longer recover a supplied cursor, emit `reset`. Never silently continue live-only after an expired cursor.

### Reset and reconciliation

- A reset means incremental replay is unavailable; it does not mean durable domain data or IndexedDB snapshots are corrupt.
- On `reset`, the client:
  1. Closes the current `EventSource`.
  2. Fetches a consistent conditional shell/list snapshot and its new `asOfSequence`.
  3. Revalidates visible resources with their ETags.
  4. Fetches snapshots for active runs.
  5. Keeps non-visible settled-session records and revalidates them when opened.
  6. Opens a new SSE feed after the new `asOfSequence`.
- Do not clear IndexedDB because a replay cursor expired.

### In-flight run ownership and reload

- Decouple run execution from the HTTP request and SSE connection. A process-owned registry keyed by `runId` owns the provider execution and cancellation controller. Browser disconnect or reload does not stop a run; only an explicit authorized cancellation mutation does.
- `GET /api/sessions/:sessionId/runs/:runId/snapshot` returns `{status, partialText, lastSequence}` from one consistent database snapshot. For an active run, fold its persisted deltas into `partialText`.
- On reload, fetch the active-run snapshot and attach the SSE feed after `lastSequence`; do not reconstruct partial output solely by replaying from an arbitrary old cursor.
- On API-process startup, mark runs left active by the previous process as `interrupted`, preserve their partial output for display, increment affected revisions, and append compact interruption events. Provider execution is not resumable across a process restart unless implemented separately later.

### IndexedDB and offline behavior

- Use `idb` with a typed `DBSchema` and explicit schema upgrades. Validate records with Valibot on every read and delete corrupt records.
- Store one complete record per settled session: account/user ID, session ID, payload, schema version, representation revision, `ETag`, and snapshot `asOfSequence`.
- Namespace records and their lightweight index by application user. Do not persist active-run deltas or a global feed cursor.
- Commit a replacement record only after the complete response has been received and validated. Retain the previous complete record if download, validation, transaction, or quota handling fails.
- Evict the oldest settled-session records first when quota requires it.
- Do not clear cached account data on sign-out. While signed out or offline, allow read-only browsing of the last locally active account's cached settled sessions. Never expose one account's records as another account's data.
- Keep `localStorage` limited to small preferences and existing appropriate drafts. The service worker caches the application shell and immutable assets only; it does not intercept SSE or act as the canonical API/session cache.
- Offline mode is read-only for cached settled sessions, preferences, and existing eligible drafts. Do not add an offline mutation queue.

### Code structure

- New modules receive required dependency objects with no production defaults hidden behind optional properties.
- Factories return objects of methods. Follow one export per file and subject-first naming such as `sessionSnapshotLoad`.
- Return `Result` from `@adaptive-ds/result` instead of throwing for expected failures.
- Keep logic out of `.tsx` files in `<name>StateCreate.ts` or bounded-context modules.
- Remove the unused `zod` dependency after shared contracts use Valibot.

## Migration approach

The SQLite/libSQL migration is active: Drizzle owns the durable runtime, typed HTTP owns browser reads and mutations, and the authenticated SSE feed carries server-to-client changes.

Establish the SQLite/libSQL runtime and fresh baseline before the remaining domain cutovers. Keep each domain on SQLite/libSQL with Drizzle plus the typed HTTP/SSE layer in one pass. Do not introduce dual writes. Keep the application runnable after each domain cutover, and retain legacy migration references only as cleanup history.

Current context: SQLite/libSQL and the typed HTTP/SSE foundation are authoritative. The remaining work is the domain and UI completion checklist; Zero and Convex are historical migration inputs, not active runtime dependencies.

## Tasks

### Phase A — inventory and foundation

- [x] 1. Inventory the legacy synchronization paths, SQL persistence, HTTP, SSE, authentication, UI read, mutation, subscription, and stream paths; create a cutover matrix and define the shared Valibot contracts.
- [x] 2. Restore the repository-managed SQL development workflow, verify the Drizzle migration workflow, and add deterministic reset/migrate/seed coverage without dual writes.
- [x] 3. Add the typed HTTP client using an injected `fetch`, shared validated contracts, canonical query keys, request coalescing, structured errors, and `Result`; remove unused `zod`.
- [x] 4. Add explicit representation revisions, strong ETag generation, conditional request handling, `Cache-Control`, `Vary`, compression, mutation idempotency records, and revision preconditions. Verify `200`, `304`, retry deduplication, and `412` behavior against a Drizzle-backed domain.

### Phase B — durable event channel

- [x] 5. Add per-user sequence-counter and event-journal tables. Implement atomic counter updates and transaction-scoped read/check/write allocation inside SQLite write transactions, deterministic shared-resource fan-out, opaque same-user cursors, persist-before-publish behavior, delta compaction, and pruning at 12 hours, 500,000 events, or 512 MiB per user.
- [x] 6. Generalize the server endpoint at `GET /api/events`: one frame per event, subscribe-before-backlog, `Last-Event-ID` before `?after=`, compact lifecycle checkpoints, 15-second heartbeat, anti-buffering headers, cursor validation, explicit reset, event-size enforcement, slow-client queue limits, blocked-write timeout, and disconnect cleanup.
- [x] 7. Add the client feed: one `EventSource` per tab, session/run demultiplexing, ordered available-event application, revision-aware invalidation, active delta application, completion replacement through HTTP, and non-destructive reset reconciliation.

### Phase C — sessions and runs

- [ ] 8. Complete sessions and messages on SQLite/libSQL with Drizzle behind typed HTTP endpoints, including keyset-paginated lists and one complete conditional settled-session snapshot response with atomic `asOfSequence`.
- [ ] 9. Move execution to the process-owned run registry so disconnect no longer aborts providers; add explicit cancellation and startup interruption reconciliation.
- [ ] 10. Move provider output to independently keyed 500ms producer coalescing and the per-user journal; flush first/size/lifecycle boundaries and retire `streamEventTable`, `streamCheckpointTable`, and the old replay client.
- [ ] 11. Add the consistent active-run snapshot endpoint returning `{status, partialText, lastSequence}` and implement snapshot-then-attach reload behavior.

### Phase D — remaining domains and UI

- [ ] 12. Complete servers, agents, notes, and remaining run operations on SQLite/libSQL with Drizzle plus typed HTTP endpoints, one mutation family at a time.
- [ ] 13. Remove remaining legacy synchronization consumers in favor of fetch-based state modules and the in-memory revision/ETag cache. Expose explicit offline, reconnecting, reconciling, and stale states.

### Phase E — IndexedDB and offline access

- [ ] 14. Add the `idb` database with versioned account/session records, Valibot validation, complete-record atomic replacement, oldest-first eviction, quota/schema failure handling, and no sign-out deletion.
- [ ] 15. Render cached settled sessions immediately, conditionally revalidate them online, automatically cache authoritative completion snapshots, and support signed-out/offline read-only browsing of the last locally active account.
- [ ] 16. Keep the service worker limited to the application shell and immutable assets; keep API and SSE network-only.

### Phase F — cleanup and verification

- [ ] 17. Add unit, integration, and browser coverage for consistent snapshot/feed bootstrap, `200`/`304`, complete session responses, mutation deduplication and conflicts, independent 500ms coalescing, first/size/lifecycle flushes, per-user sequence ordering, shared-resource fan-out, cross-user cursor rejection, finalized-delta compaction, 12-hour/count/size pruning, reconnect through completion checkpoints, cursor reset, multiple tabs and parallel runs, slow clients, active-run reload, process-restart interruption, atomic IndexedDB replacement, account isolation, retained sign-out data, and signed-out/offline reads.
- [ ] 18. Remove remaining historical Zero/Convex runtime references, compatibility branches, generated files, schemas, seeds, fixtures, tests, environment variables, build/release tooling, operations units, persistent service data/volumes, and obsolete active operational documentation after all domains have cut over; preserve dated feature-plan records as historical records.
- [ ] 19. Verify proxy buffering, compression, auth expiry, disconnect cleanup, metrics, deterministic seeding, managed services, build/type checks, and end-to-end behavior before declaring the migration complete.

## Main paths

- Server and routes: `src/index.ts`, `src/server/`, `src/app/`, `src/api/`
- Authentication: `src/identity/`, `src/authentication/`
- Persistence: `src/database/`, `src/*/db/`, `src/*/schema/`
- Streaming and runs: `src/stream/`, `src/run/`, `src/session/actions/`
- Client and PWA: `src/ui/`, `src/ui/pwa/`
- Projects and providers: `src/project/`, `src/providers/`
- Tests: `e2e/`, bounded-context test directories
- Operations and scripts: `ops/dev/`, `scripts/`
- Historical cleanup inventory: former Zero/Convex implementation paths contain no active code; their names remain only in this plan, the cutover matrix, and dated feature-plan records. Empty legacy directories may remain in the working tree.
