# Bounded Session History Migration

## Goal

Complete the transition described in `docs/20260831_bounded-session-history.md` with correctly ordered durable history, bounded database and client work, durable finalized-run details, valid child-run navigation, and separate lightweight global and detailed selected-session streaming.

## Decisions

- Treat this as an atomic alpha cutover. Existing local data, old clients, old cursors, and old binaries do not require compatibility.
- Replace the development database through the repository-owned reset/seed workflow after changing the schema. Do not add backfill, dual writes, compatibility windows, database backup, or legacy read fallbacks.
- Preserve signed-out and offline browsing through a new IndexedDB generation. Abandon and delete the old full-message settled-session database rather than migrating its records.
- Persist only authoritative bounded session snapshots, cached projected history pages, and previously fetched durable details. Namespace records by user and session and enforce explicit entry, byte, and account-level eviction limits.
- In IndexedDB/offline cache, never persist raw stream deltas, synthetic positions, full legacy message snapshots, or global-feed payload history. The canonical server journal may persist transient deltas for active-run replay until terminal compaction/deletion. Offline state uses `throughPosition` and stable projected entry IDs.
- Keep bounded IndexedDB data across sign-out for the last active account, while clearing volatile HTTP, selected-stream, cursor, and reconciliation state. Account switching must not expose another account's cached records.
- Add a session-owned history projection while preserving messages, runs, attempts, delegations, and journal events as canonical records for their existing workflows.
- Give each projected entry a stable source identity and a session-local monotonic `position`, allocated atomically from the session row in the canonical write transaction. Positions may have gaps and are never reused.
- Project one entry per message, one mutable summary entry per run, and one mutable entry per stable tool call. Attach delegation metadata to its tool entry rather than creating a duplicate timeline entry.
- Freeze page membership and ordering at `throughPosition`; projection summaries may still be updated. Full historical payload versioning is out of scope.
- Keep the user-global journal sequence as `globalSequence`. Never compare it with session-local `position`.
- Persist bounded finalized transcript and tool-detail records, including for child runs, before deleting their obsolete run deltas. Child bounded-history/detail views use the application-user/account-scoped IndexedDB cache.
- Store bounded active-run state separately from full deltas so snapshot reads do not reconstruct all active output.
- Keep the global feed lightweight: lifecycle summaries, invalidations, resets, and authoritative input-needed summaries only. Prohibit transcript, tool, thinking, provider, and generic delta payloads.
- Add one separately authorized selected-session detail stream per tab. Its cursor and frames use mutable session-local `changePosition`; each frame also carries the stable entry ID and immutable `position` used for timeline ordering.
- Model delegated conversations by `parentSessionId + childRunId + delegationId`; normal child runs remain in the parent session.
- Defer authoritative waiting-for-input history until the runtime has a durable request and resolution protocol.
- Use only repository-managed services and deterministic seeded fixtures for migration and acceptance testing.
- Keep SSE transport behind narrow interfaces and inject stream sources/sinks at route and client state boundaries so framing, replay, reset, reconnect, closure, and error handling are testable without a browser.

## Approach

- Define projection, ordering, cursor, stream, and child-run contracts first.
- Replace the schema and implement only the new transactional write paths, bounded reads, durable details, and stream protocols.
- Remove legacy reconstruction and keep full detail off the global summary stream in the same cutover rather than maintaining parallel implementations.
- Replace the existing IndexedDB settled-session store with a new bounded schema and connect online snapshot, pagination, detail, completion, account-switching, and offline-view state to it.
- Stop managed services, run the repository-owned database reset/seed workflow, and start the combined preview on the new schema.
- Exercise SSE behavior through deterministic in-memory adapters while retaining the browser-native production adapter.
- The bounded session-history cutover is complete; the new projection, bounded paging/cache, durable finalized details, split summary/detail SSE contracts, and injected source/sink boundaries are the only supported path.

## Current context

The implementation and cutover are complete. The lasting architecture is recorded in [`docs/20260822_http_sse_migration_plan.md`](20260822_http_sse_migration_plan.md). Authoritative waiting-for-input history remains deferred until the runtime provides a durable request and resolution protocol.

## Tasks

- [x] 1. Specify the projection matrix and invariants: source identity, create/update behavior, transaction boundary, position allocation, mutable-summary semantics, `throughPosition`, cursor claims, detail responses, child-run identity, and stream frame limits.
- [x] 2. Add schema and indexes for session position allocation, `session_history_entry`, bounded active-run state, and `run_finalized_detail`. Enforce session/user ownership, source idempotency, and unique `(sessionId, position)`.
- [x] 3. Add transaction-scoped projection repository APIs accepting the caller's database executor; never open independent transactions or allocate with `max(position) + 1`.
- [x] 4. Integrate projection writes directly into message append and branch-copy paths; run start, tool delta, ordinary finalization, startup interruption, and terminal paths; and child delegation creation/finalization. Persist final detail before delta deletion and roll back finalization if detail persistence fails.
- [x] 5. Replace snapshot and older-page reconstruction with indexed projection queries bounded to `limit + 1`; return `throughPosition`, keep a fixed watermark across pages, and remove full message/run/event/delegation and active-delta scans.
- [x] 6. Switch finalized run/tool detail and delegation reads to durable records. Return a typed active result where needed, authorize through session/server/organization joins, and load child conversations by parent session plus child run.
- [x] 7. Replace the current stream contracts: global summary frames keyed by `globalSequence`, and selected-session detail frames keyed by session `changePosition` while carrying immutable entry `position`. Reuse the existing SSE writer and publication infrastructure while separating backlog, cursor, authorization, replay, reset, and payload schemas.
- [x] 8. Replace client coordination with separate global-summary and selected-detail states. Attach the selected stream from the snapshot cursor, apply immutable timeline ordering by `position` while advancing mutable `changePosition`, ignore stale selection generations, bound detailed retention by entries and bytes, and resnapshot on eviction or reset.
- [x] 9. Make terminal reconciliation authoritative and monotonic for completed, failed, cancelled, and interrupted runs. Retain visible tail data until replacement succeeds, preserve exact terminal kinds, reject stale replacements/events, and remove synthetic server positions.
- [x] 10. Replace the old IndexedDB database with a new bounded, schema-versioned store for account/session snapshots, projected history entries, pagination metadata, and cached durable run/tool details. Define record keys, indexes, atomic replacement, serialization validation, and count/byte/quota eviction.
- [x] 11. Integrate IndexedDB with online and offline state: render cached bounded history immediately, revalidate online, persist accepted snapshots/pages/details and authoritative completion replacements, retain cache across sign-out, isolate account switching, and clear all volatile state without deleting offline records.
- [x] 12. Remove full-message settled-cache records, numeric cursor conversion, legacy message fallback, and old IndexedDB schema/upgrade code. Delete the obsolete database during the alpha cutover without attempting record migration.
- [x] 13. Update deterministic seed data to create more than 25 projected entries with runs, attempts, tools, delegation, child-run detail, and completed, failed, cancelled, and interrupted outcomes through repository-owned workflows.
- [x] 14. Add serial schema/repository tests for allocation, transactional rollback, every projection write path, finalized-detail survival, startup interruption, child runs, bounded query work, ordering, pagination, and authorization.
- [x] 15. Add API/stream/state tests for cursor validation, fixed-watermark pagination, global payload limits and delta exclusion, selected-stream handoff, replay/reset/reconnect, terminal monotonicity, retention eviction, session switching, and account isolation.
- [x] 16. Add IndexedDB tests for new-database creation, old-database deletion, schema validation, bounded snapshot/page/detail persistence, atomic replacement, corrupt records, quota eviction, offline rendering, online revalidation, sign-out retention, and cross-account isolation.
- [x] 17. Remove legacy full-history reconstruction, enforce summary-only global feed behavior, retire obsolete cursor handling, and bound client retention as part of the same implementation.
- [x] 18. Stop managed services and run the repository-owned database reset/seed workflow so the new server schema and projection become the only supported local state.
- [x] 19. Add combined-preview browser coverage for bounded load, older pages, lazy details, active streaming, reconnect/reset, terminal transitions, child navigation, offline reload, signed-out cached browsing, and account isolation, including network-contract assertions.
- [x] 20. Formalize narrow SSE source/sink interfaces and dependency injection at server-route and client-state boundaries, then add deterministic non-browser tests for framing, replay, reset, reconnect, closure, and error handling without introducing another transport framework.
- [x] 21. Run the serial full test suite including the separately configured provider integration test, typecheck, formatting, database reset/seed checks, managed deployment/readiness, and single-worker combined-preview E2E. Run E2E only after all faster checks pass; on failure rerun and fix only the failing file or test. Never start a separate development server.
- [x] 22. Record the lasting projection, ordering, detail-retention, cursor, stream, SSE dependency-injection, and offline-cache decisions in architecture documentation, then update both bounded-history plans to complete. The cutover is complete.
