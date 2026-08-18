# Zero slow-query materialization

## Goal

Record the reported browser warnings for the `session` and `run` queries, which were both approximately 5.9 seconds, and define an evidence-first investigation order.

## Findings

- The browser warning is emitted for `query-materialization-end-to-end` when the value is **strictly greater than 5,000 ms**. Its exact message is `Slow query materialization (including server/network)`. The default `slowMaterializeThreshold` is 5,000 ms.
- This is the end-to-end client metric, exposed by the Zero Inspector as `hydrateTotal`. It includes the authoritative server result, network time, and client materialization. `hydrateServer` is the separate server-side hydration duration. A 5.9-second warning is therefore not proof that a PostgreSQL query itself ran for 5.9 seconds.
- The two near-identical durations make a shared authoritative initial synchronization, connection, cache, or query-resolution delay plausible. They do not prove a shared PostgreSQL plan, an index problem, or a reconnect artifact. Measure each query's `hydrateServer` and `hydrateTotal` before changing queries or indexes.
- The linked Zero checkout is `/home/david/opensource/zero`. The release input records source revision `9a8ca356a54b5a2f32b4065c483cad0411881b21` in `release-inputs.json:7-16`; commit `76b792f2c63e13dcda0da285b9f302955c32a8bd` is an ancestor of that revision. The release therefore includes reconnect fix PR [rocicorp/mono#6308](https://github.com/rocicorp/mono/pull/6308), which is related upstream material, not evidence that this app has the same cause.

## Implemented handling

- `activeSessions` uses one live ordered query with the existing `updatedAt DESC, id DESC` order. It starts with the configured page size, 25 by default. Each "Load more" action increases the live query limit by one page, and previously loaded sessions remain reactive.
- The sidebar's "Load more" action expands the same live ordered query's limit by one page. It is available in the pinned, projects, and recent views, but not search. A short page ends pagination, and repeated clicks while loading are ignored. Other list-shaped queries remain unbounded.
- The page limit bounds the initial session result, but it does not remove Zero's initial authoritative server/network synchronization. The five-second warning can still appear when `hydrateTotal` is greater than 5,000 ms. Exactly 5,000 ms does not trigger it.

In development, `CodelineZeroProvider` polls the public Zero Inspector immediately and every second. It warns only for non-deleted queries whose `hydrateTotal` exceeds the threshold, and deduplicates repeated totals. Each warning includes `thresholdMs`, `hydrateClient`, `hydrateServer`, `hydrateTotal`, `rowCount`, the query identity (`id`, `name`, `inactivatedAt`, and `ttl`), redacted query fields (`args`, `clientZQL`, and `serverZQL`), and best-effort analysis. Analysis reports `dbScansByQuery`, `readRowCount`, and `readRowCountsByQuery`, and logs SQLite plans when available. Literal-bearing join plans are omitted, and raw query values are redacted. Before a result, its status can be `pending` or `unavailable`. The diagnostics do not run in production.

## Current queries and index gaps

`src/ui/codelineQueries.ts` defines the relevant shapes:

- `activeSession` (`:12-18`) looks up one non-archived session by `id` and authenticated `userId`.
- `activeSessions` (`:19-27`) filters by `userId` and `archivedAt IS NULL`, then orders by `updatedAt DESC, id DESC`. The sidebar passes an expanding live-query limit.
- `activeRuns` (`:28-34`) filters by `userId` and `status IN ('accepted', 'running')`, then orders by `updatedAt DESC, id DESC`. It remains unbounded.
- `latestSessionRun` (`:43-51`) filters runs by `sessionId` and `userId`, orders by `createdAt DESC, id DESC`, uses `.one()`, and includes all related attempts ordered by `ordinal`.
- `sessionRuns` (`:52-59`) filters runs by `sessionId` and `userId`, orders by `createdAt ASC, id ASC`, and includes all related attempts ordered by `ordinal`. It remains unbounded.

The PostgreSQL definitions currently provide:

- `src/session/db/sessionTable.ts:40-43`: `(user_id, updated_at)`, `(user_id, archived_at)`, `server_id`, and `parent_session_id` indexes. There is no index matching the active-session filter and `(updated_at, id)` ordering in one path. The point lookup also has the primary key on `id` and the unique `(user_id, id)` constraint.
- `src/run/db/runTable.ts:58-60`: `(user_id, updated_at, id)`, `(session_id, updated_at, id)`, and `stream_id` indexes. The active-run filter has no status-leading or status-covering index. The session-run queries filter on both `session_id` and `user_id`, order by `created_at`, and have no matching `(session_id, user_id, created_at, id)` index.
- `src/run/db/attemptTable.ts:42-44`: `(run_id, ordinal)` already supports the related-attempt lookup and ordering. Do not add an attempt index without query-plan evidence.

These are candidate gaps, not an index prescription. Zero's analysis must show excess scans or temporary ordering work before adding a migration.

## Handling order

1. Use the [Zero Inspector](https://zero.rocicorp.dev/docs/debug/inspector) to inspect the `session` and `run` rows. Compare `hydrateServer` with `hydrateTotal`. A high `hydrateServer` points to authoritative server hydration and calls for `serverZQL` analysis, row-read counts, scans, and SQLite plans. A high `hydrateTotal` with a lower `hydrateServer` points instead to initial synchronization, network, cache, or client materialization; do not treat it as an index prescription. Record `rowCount`, `serverZQL`, `clientZQL`, `hydrateServer`, `hydrateTotal`, `ttl`, and `inactivatedAt`, then run `query.analyze()` when needed. Pay particular attention to `TEMP B-TREE` and scans that are much larger than the synced row count. Use the [Analyze Query CLI](https://zero.rocicorp.dev/docs/debug/analyze-query-cli) when a repeatable capture is needed.
2. Keep `activeSessions` bounded by its implemented expanding live-query limit. Add bounded `.limit()` pagination to the remaining list-shaped subscriptions where the product behavior permits it, including `activeRuns`, `sessionRuns`, and large related-attempt collections. Keep `latestSessionRun` bounded by its existing `.one()`.
3. Add PostgreSQL indexes only when Inspector/Analyze Query and PostgreSQL evidence show a specific scan or sort problem. Zero copies PostgreSQL indexes to its SQLite replica, so index changes should match the measured filter and order.
4. Narrow the active-run subscription to the session or active context that the UI actually needs instead of syncing every accepted/running run for the user.
5. Use targeted preload and a short, intentional TTL for data needed across navigation. Avoid preloading broad run history or keeping unused subscriptions alive.
6. Adjust the 5-second threshold only as a diagnostic control. Raising or disabling it hides the warning; it does not reduce synchronization or materialization time.

## Upstream context

`rocicorp/mono` has public issues, but no matching issue authored by `david1gp` was expected. The user is new to Zero, not a maintainer of `rocicorp/mono`. The related [tldraw/tldraw#9808](https://github.com/tldraw/tldraw/issues/9808) issue and [rocicorp/mono#6308](https://github.com/rocicorp/mono/pull/6308) PR are upstream reference material only, not this app's issue record or proof of root cause.

## Paths

- `src/ui/codelineQueries.ts`
- `src/session/db/sessionTable.ts`
- `src/run/db/runTable.ts`
- `src/run/db/attemptTable.ts`
- `src/database/zeroSchema.ts`
- `package.json`
- `ops/dev/zero-link.sh`
- `release-inputs.json`

## Primary sources

- [Zero queries and synchronization](https://zero.rocicorp.dev/docs/queries)
- [Zero ZQL limit and paging](https://zero.rocicorp.dev/docs/zql#limit)
- [Zero slow queries](https://zero.rocicorp.dev/docs/debug/slow-queries)
- [Client 5-second threshold](https://github.com/rocicorp/mono/blob/9a8ca356a54b5a2f32b4065c483cad0411881b21/packages/zero-client/src/client/zero.ts#L504-L518)
- [Client warning emission](https://github.com/rocicorp/mono/blob/9a8ca356a54b5a2f32b4065c483cad0411881b21/packages/zero-client/src/client/query-manager.ts#L521-L534)
- [Inspector hydration metrics](https://github.com/rocicorp/mono/blob/9a8ca356a54b5a2f32b4065c483cad0411881b21/packages/zero-client/src/client/inspector/query.ts#L90-L96)
- [Reconnect fix PR #6308](https://github.com/rocicorp/mono/pull/6308)
- [Reconnect fix commit 76b792f](https://github.com/rocicorp/mono/commit/76b792f2c63e13dcda0da285b9f302955c32a8bd)
- [Release source revision](https://github.com/rocicorp/mono/tree/9a8ca356a54b5a2f32b4065c483cad0411881b21)
