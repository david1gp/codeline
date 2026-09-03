# HTTP + SSE data layer migration

This document records the completed replacement of the legacy Zero/Convex paths and the completed bounded session-history cutover. SQLite/libSQL with Drizzle, typed HTTP, and authenticated summary/detail SSE are the current architecture; legacy names below are historical cleanup context only.

Historical predecessor plans:

- `docs/20260822_migrate_zero_to_convex.md`

## Goal

Replace Zero and the partial Convex migration with a server-authoritative data layer inside the existing Hono application. SQLite/libSQL with Drizzle is the durable source of truth; typed JSON HTTP handles reads and mutations; a lightweight user-global summary SSE and a separately authorized selected-session detail SSE carry server-to-client changes; and IndexedDB provides bounded, account-isolated, read-only access to projected session history.

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
- Use keyset pagination for lists. Session lists key on `(updatedAt, id)`; bounded session-history snapshots and older pages key on immutable projected-entry `position` at a fixed `throughPosition`. Do not add offset pagination or paginate token deltas.
- Use authenticated, same-origin SSE per tab: a user-global summary feed and, when a session is selected, a separately authorized selected-session detail feed. The session cookie is attached automatically; global and selected-session cursors are distinct.
- SSE is carried over HTTP, not WebSocket. Send `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, and an idle heartbeat every 15 seconds.

### HTTP contracts, revisions, and caching

- Define request and response contracts with shared Valibot schemas in their bounded contexts. Validate every HTTP boundary and use stable public IDs rather than database implementation IDs.
- Every cacheable representation has an explicit integer revision. Increment it transactionally whenever any data included in that representation changes. Do not use `updatedAt` as a strong representation version unless it is guaranteed to change for every included value.
- Derive strong `ETag` values from representation identity, schema version, and revision. Honor `If-None-Match` with `304 Not Modified`.
- Cacheable authenticated responses use `Cache-Control: private, no-cache` and `Vary: Cookie, Accept-Encoding`. Compress bounded session snapshots and history pages where useful.
- Use `If-Match` and `412 Precondition Failed` for edits or deletes where a stale mutation could overwrite a concurrent change. Return structured conflict responses.
- Use client-generated idempotency keys for prompt submission and other retryable create/action mutations. Store the key and result transactionally with the mutation.
- Keep optimistic client behavior limited to prompt submission. Do not add a general optimistic mutation, rebase, or offline mutation framework.

### Bounded session snapshots and projected history

- Canonical messages, runs, attempts, delegations, and journal events remain authoritative. A session-owned projection supplies bounded reads with one stable source identity and public entry ID per projected message, run summary, or tool summary.
- `GET /api/sessions/:sessionId/bounded-snapshot` returns one consistent bounded response containing the latest answer, up to 25 projected semantic steps through `throughPosition`, current bounded run/input state, an opaque older-page cursor, and the selected-session `detailCursor`.
- A new projected entry atomically allocates an immutable session ordering `position` and its initial mutable `changePosition` from the session row in the canonical write transaction. Updates allocate only `changePosition`; they never move the entry. Positions may have gaps and are never reused.
- Older pages use descending keyset work bounded to `limit + 1`, return entries in display order, and retain the original `throughPosition`. Snapshot/page membership is fixed by `entry.position <= throughPosition`; mutable summaries may update without historical payload versioning.
- Run and tool entries are compact mutable summaries. Fetch bounded normalized run/tool detail lazily from durable finalized records, or return a typed bounded active result while a run is active. Child-run finalization persists finalized transcript/tool details before deleting child deltas, and child bounded-history/detail views use the same application-user/account-scoped IndexedDB cache.
- Delegated conversations use `parentSessionId + childRunId + delegationId` as their identity. Normal child runs remain in the parent session; navigation and authorization use that triple rather than synthesizing a child session.
- Persist waiting-for-input history only when the runtime provides an authoritative durable request and resolution protocol; do not infer it from tool names or transient stream state.
- On an IndexedDB hit, render the bounded cached state immediately and revalidate it. A valid response atomically replaces the session snapshot, projected entries, and history pages; finalized run and tool details are cached separately. Failed download, validation, transaction, or quota work retains the prior record.
- When a run completes, or completion is discovered during reconciliation, retain the visible tail until the authoritative bounded replacement succeeds, then cache that replacement atomically.

### Per-user journal sequencing

- Maintain one durable journal and one monotonic sequence per `applicationUser.id`. The scope is the application user, not the login session, organization, device, tab, session, or run.
- Allocate sequences through atomic per-user counter updates inside the same SQLite write transaction as the domain mutation and journal insert. Use transaction-scoped read/check/write operations; do not rely on database locks, a global sequence, or an in-process serialization queue for commit ordering.
- For an organization resource shared by multiple users, append an independently sequenced event to every currently authorized user's journal in the domain transaction. Process users in a deterministic order so counter updates have stable ordering.
- Publish events only after their transaction commits. A rolled-back transaction publishes nothing and does not advance the per-user sequence.
- Treat the SSE event ID as an opaque same-user cursor containing the user's journal identity and sequence. Reject a cursor belonging to another user's journal.

### Snapshot/feed race freedom

- Bootstrap from a shell/list HTTP snapshot or `GET /api/sessions/:sessionId/bounded-snapshot`. The shell/list response supplies its `asOfCursor`; the bounded snapshot supplies `throughPosition` and `detailCursor`, each from its endpoint's consistent database read.
- After bootstrap, open the global summary SSE after `asOfCursor`; for a selected session, open its detail SSE after `detailCursor`. On automatic reconnect, `Last-Event-ID` takes precedence for the relevant stream.
- Within each SSE endpoint, subscribe to live publication before reading the backlog, then deduplicate by that stream's cursor. Reading the backlog first would lose events published in between.
- Do not persist standalone stream cursors in IndexedDB or `localStorage`. Each tab keeps only current in-memory connection cursors; cached session records retain the snapshot metadata needed to resume or resnapshot.

### SSE summary and selected-session detail

- The user-global summary SSE is ordered by `globalSequence` and contains only lifecycle summaries, invalidations, and authoritative input-needed summaries. It never carries transcript, tool, thinking, provider, or generic delta payloads.
- The separately authorized selected-session detail SSE is ordered by mutable session `changePosition`. Applicable frames carry the stable projected entry ID and immutable ordering `position`; bounded selected-session updates and active output stay on this stream or HTTP detail endpoints, never on the global summary stream.
- Global and selected-session streams have separate schemas, authorization, cursors, replay, reset, and retention behavior. `globalSequence` is never compared with session-local `position` or `changePosition`.
- Send exactly one JSON event per SSE frame. Do not add JSONL or replay batch frames.
- Summary lifecycle event types include `invalidate`, `run-completed`, `run-failed`, `run-cancelled`, and `run-interrupted`; selected-session detail frames use the session detail contract.
- Coalesce active-run fragments independently by run, message, and delta kind with a configurable 500ms default.
- Flush the first fragment immediately, flush at the serialized size boundary, and flush before every lifecycle event. Batch browser rendering separately from producer coalescing.
- Limit each serialized UTF-8 event to 128 KiB before compression.
- Cap queued output for one connection at 1 MiB or 1,024 events. If either limit is reached, or a write remains blocked for 15 seconds, disconnect the client so it can recover through replay rather than dropping sequenced events.

### Delta compaction and opportunistic replay retention

- Persist bounded active-run state and any replayable transient deltas in the canonical server journal before publication so an attached selected-session client can recover from a short disconnect while the run remains active. The IndexedDB/offline cache never persists those raw stream deltas.
- Finalize a run in one transaction:
  1. Flush the producer buffer.
  2. Store the complete authoritative message or terminal partial result.
  3. Persist and validate the bounded finalized run transcript and tool-detail record.
  4. Store the terminal run status.
  5. Increment affected representation revisions.
  6. Delete that run's now-obsolete persisted delta events.
  7. Append the compact terminal lifecycle event, including the authoritative resource revision.
- Finalized detail must be durable before delta deletion; failure rolls back terminal persistence and deletion. Publish summary/detail frames only after that transaction commits. A reconnecting client uses the durable detail or bounded HTTP snapshot rather than reconstructing deleted deltas.
- Intentional sequence gaps from finalized-run delta deletion are valid. The client applies available events in order but does not infer corruption from numeric non-contiguity; the server decides whether a cursor is recoverable.
- After a journal-producing write commits, schedule opportunistic pruning of compact lifecycle and invalidation events. Maintenance enforces the 12-hour age, 500,000-event count, and 512 MiB serialized-byte limits per user, whichever requires pruning first; the age threshold is not a strict wall-clock maximum while a user is idle. Prune oldest compact events without reusing sequence numbers.
- The per-user coalescing scheduler tracks at most 4,096 users. It removes an idle user's state when no run, pending work, or deferred timer remains and the cooldown has elapsed; at capacity it may evict the oldest eligible idle state. Running or pending states are retained, and pruning, logging, and metrics failures remain isolated from committed writes.
- An expired or out-of-range global cursor returns HTTP 400 and triggers reconciliation. The reset-mode result is not delivered as a reset SSE frame.

### Reset and reconciliation

- A delivered selected-detail `reset` means incremental replay is unavailable; it does not mean durable domain data or bounded IndexedDB records are corrupt. Selected-detail eviction also requires a bounded session resnapshot. Global cursor expiry is handled by HTTP 400 and reconciliation instead of a delivered reset frame.
- On a delivered selected-detail `reset`, the client:
  1. Closes the affected `EventSource` connection(s).
  2. Fetches an authoritative shell/list response for global reconciliation or bounded session snapshot for selected detail, using `asOfCursor`, `detailCursor`, and `throughPosition` as applicable.
  3. Revalidates visible resources through their typed HTTP reads.
  4. Fetches snapshots for active runs.
  5. Keeps non-visible bounded account/session records and revalidates them when opened.
  6. Opens a new selected-session detail SSE after its new `detailCursor`; global reconciliation opens the summary SSE after its new `asOfCursor`.
- Do not clear IndexedDB because a replay cursor expired.
- Do not synthesize positions. Retain visible tail data until authoritative replacement succeeds; reject stale replacements and events.

### In-flight run ownership and reload

- Decouple run execution from the HTTP request and SSE connection. A process-owned registry keyed by `runId` owns the provider execution and cancellation controller. Browser disconnect or reload does not stop a run; only an explicit authorized cancellation mutation does.
- `POST /api/sessions/:sessionId/chat` is a detached JSON command start: it returns the command response immediately, while the process-owned registry runs execution and the journal-backed summary/detail feeds report changes.
- `GET /api/sessions/:sessionId/runs/:runId/snapshot` returns bounded active state and `{status, partialText, lastSequence, lastCursor}` from one consistent database snapshot. Fold bounded active state or replayable deltas into `partialText` while the run is active.
- On reload, fetch the active-run snapshot and attach the selected-session detail SSE after its `changePosition`; do not reconstruct partial output solely by replaying from an arbitrary old cursor.
- On API-process startup, mark runs left active by the previous process as `interrupted`, preserve their partial output for display, increment affected revisions, and append compact interruption events. Provider execution is not resumable across a process restart unless implemented separately later.

### IndexedDB and offline behavior

- Use `idb` with a typed `DBSchema` and explicit schema upgrades. Validate records with Valibot on every read and delete corrupt records.
- Store bounded account/session snapshot records, projected history entries, pagination metadata, and finalized run/tool details in separate cache stores. Snapshot records carry account/user ID, session ID, schema metadata, `detailCursor`, and `throughPosition`.
- Namespace every record and index by application user and session. Retain bounded data across sign-out for the last active account, clear volatile HTTP, selected-stream, cursor, and reconciliation state, and never expose one account's records as another account's data.
- For IndexedDB/offline cache, “never persist raw stream deltas” means do not store them there, along with full legacy message snapshots, global-feed payload history, or standalone stream cursors. The canonical server journal may persist transient deltas for active-run replay until terminal compaction/deletion. Commit snapshot/page/detail replacements only after validation and retain prior valid records on failure.
- Enforce explicit entry, byte, and account-level limits with oldest-first/quota eviction. Offline mode is read-only for cached bounded history and eligible drafts; do not add an offline mutation queue.
- Keep `localStorage` limited to small preferences and existing appropriate drafts. The service worker caches the application shell and immutable assets only; it does not intercept SSE or act as the canonical API/session cache.

### Code structure

- New modules receive required dependency objects with no production defaults hidden behind optional properties.
- Keep SSE behind narrow source/sink interfaces. Inject sources and sinks at server-route and client-state boundaries; use async generators only at natural pull boundaries, not as the shape of every layer.
- Factories return objects of methods. Follow one export per file and subject-first naming such as `sessionSnapshotLoad`.
- Return `Result` from `@adaptive-ds/result` instead of throwing for expected failures.
- Keep logic out of `.tsx` files in `<name>StateCreate.ts` or bounded-context modules.
- Remove the unused `zod` dependency after shared contracts use Valibot.

## Migration approach

The SQLite/libSQL and HTTP/SSE migrations are complete: Drizzle owns the durable runtime, typed HTTP owns browser reads and mutations, and separate global-summary and selected-session-detail SSE carry server-to-client changes.

The bounded session-history cutover is part of this completed architecture. Canonical records, bounded projections, durable finalized details, split stream contracts, injected SSE sources/sinks, and account-isolated IndexedDB records are the only supported paths; retain legacy migration references only as cleanup history.

Current context: The HTTP/SSE and bounded session-history migrations are complete. Database-native transaction ordering, explicit SSE dependencies, bounded projections and cache, durable finalized details, split summary/detail streams, and account isolation are the supported behavior.

## Tasks

### Phase A — inventory and foundation

- [x] 1. Inventory the legacy synchronization paths, SQL persistence, HTTP, SSE, authentication, UI read, mutation, subscription, and stream paths; create a cutover matrix and define the shared Valibot contracts.
- [x] 2. Restore the repository-managed SQL development workflow, verify the Drizzle migration workflow, and add deterministic reset/migrate/seed coverage without dual writes.
- [x] 3. Add the typed HTTP client using an injected `fetch`, shared validated contracts, canonical query keys, request coalescing, structured errors, and `Result`; remove unused `zod`.
- [x] 4. Add explicit representation revisions, strong ETag generation, conditional request handling, `Cache-Control`, `Vary`, compression, mutation idempotency records, and revision preconditions. Verify `200`, `304`, retry deduplication, and `412` behavior against a Drizzle-backed domain.

### Phase B — durable event channel

- [x] 5. Add per-user sequence-counter and event-journal tables. Implement atomic counter updates and transaction-scoped read/check/write allocation inside SQLite write transactions, deterministic shared-resource fan-out, opaque same-user cursors, persist-before-publish behavior, delta compaction, and opportunistic post-write pruning at the 12-hour, 500,000-event, or 512 MiB per-user limits.
- [x] 6. Generalize the server endpoint at `GET /api/events`: one frame per event, subscribe-before-backlog, `Last-Event-ID` before `?after=`, compact lifecycle checkpoints, 15-second heartbeat, anti-buffering headers, cursor validation, expired-cursor HTTP 400 reconciliation, event-size enforcement, slow-client queue limits, blocked-write timeout, and disconnect cleanup.
- [x] 7. Add the client feeds: a global summary stream and separately authorized selected-session detail stream, ordered cursor application, revision-aware invalidation, active detail updates, completion replacement through HTTP, and non-destructive reset reconciliation.

### Phase C — sessions and runs

- [x] 8. Complete sessions and messages on SQLite/libSQL with Drizzle behind typed HTTP endpoints, including keyset-paginated lists and bounded projected session snapshots with fixed `throughPosition` and selected-session `detailCursor`.
- [x] 9. Move execution to the process-owned run registry so disconnect no longer aborts providers; add explicit cancellation and startup interruption reconciliation.
- [x] 10. Route provider output through `src/run/actions/runProviderOutputCreate.ts` and `src/journal/actions/journalWriteCreate.ts`, with independently keyed 500ms producer coalescing; flush first/size/lifecycle boundaries and publish through the global-summary and selected-session-detail paths.
- [x] 11. Add the consistent bounded active-run snapshot endpoint and implement snapshot-then-attach selected-detail behavior.

### Phase D — domains and UI

- [x] 12. Complete servers, agents, notes, and run operations on SQLite/libSQL with Drizzle plus typed HTTP endpoints, one mutation family at a time.
- [x] 13. Replace legacy synchronization consumers with fetch-based state modules and the in-memory revision/ETag cache. Expose explicit offline, reconnecting, reconciling, and stale states.

### Phase E — IndexedDB and offline access

- [x] 14. Add the `idb` database with versioned account/session snapshot, projected-entry, pagination, and durable-detail records; Valibot validation; atomic bounded replacement; entry/byte/account eviction; quota/schema failure handling; and no sign-out deletion.
- [x] 15. Render cached bounded history immediately, conditionally revalidate it online, cache authoritative completion replacements and fetched details, and support signed-out/offline read-only browsing of the last locally active account.
- [x] 16. Keep the service worker limited to the application shell and immutable assets; keep API and SSE network-only.

### Phase F — completed cleanup and verification

- [x] 17. Add unit, integration, and browser coverage for consistent bounded snapshot/feed bootstrap, `200`/`304`, projection and detail contracts, mutation deduplication and conflicts, independent 500ms coalescing, first/size/lifecycle flushes, per-user sequence ordering, shared-resource fan-out, cross-user cursor rejection, durable finalized-detail retention, opportunistic post-write 12-hour/count/size pruning, reconnect through completion checkpoints, cursor reset, multiple tabs and parallel runs, slow clients, active-run reload, process-restart interruption, atomic IndexedDB replacement, account isolation, retained sign-out data, and signed-out/offline reads.
- [x] 18. Remove historical Zero/Convex runtime references, compatibility branches, generated files, schemas, seeds, fixtures, tests, environment variables, build/release tooling, operations units, persistent service data/volumes, and obsolete active operational documentation after all domains have cut over; preserve dated feature-plan records as historical records.
- [x] 19. Verify proxy buffering, compression, auth expiry, disconnect cleanup, metrics, deterministic seeding, managed services, build/type checks, and end-to-end behavior before declaring the migration complete.

## Main paths

- Server and routes: `src/index.ts`, `src/server/`, `src/app/`, `src/api/`
- Authentication: `src/identity/`
- Persistence: `src/database/`, `src/*/db/`, `src/*/schema/`
- Streaming and runs: `src/stream/`, `src/run/`, `src/session/actions/`
- Client and PWA: `src/ui/`, `src/ui/pwa/`
- Projects and providers: `src/project/`, `src/providers/`
- Tests: `e2e/`, bounded-context test directories
- Operations and scripts: `ops/dev/`, `scripts/`
- Historical cleanup inventory: former Zero/Convex implementation paths contain no active code; their names remain only in this plan, the cutover matrix, and dated feature-plan records. Empty legacy directories may remain in the working tree.
