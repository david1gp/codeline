# Hybrid session event streaming

## Goal

Keep background sessions immediately observable while bounding per-tab network and transcript memory, preserving an independent stream per browser tab, and retaining durable replay, reload equivalence, and correct selection-time rehydration.

## Decisions

- Keep one authenticated `/api/events` SSE connection per browser tab; do not share transport ownership across tabs or create one connection per session.
- Deliver lightweight lifecycle/status events for all relevant sessions on each tab's stream and full transcript/thinking/tool detail only for that tab's subscribed materialized session IDs.
- Split client state into a lightweight cross-session projection and selectively materialized session detail.
- Retain lightweight metadata for every relevant session/run: identity, status, activity time, terminal outcome, revision, sequence, interaction/notification state, and latest cursor.
- Materialize transcript text, thinking, and tool buffers only for visible sessions plus the two most recently visible sessions. Use deterministic session-level LRU eviction rather than timers; eviction never removes lightweight metadata or durable cache entries.
- Let the server filter hidden-session detail for each tab before transmission. Deliver monotonic cursor checkpoints for scanned-but-omitted journal ranges so replay can advance without sending hidden payloads.
- Include the tab's materialized session IDs and current cursor in the SSE request. Because SSE is one-way, a selection change creates a replacement EventSource with the new detail set; keep the old source until the replacement is ready, then close it and deduplicate overlap by cursor/event identity.
- Rehydrate selected active sessions from the authoritative active-run snapshot and selected settled sessions from the complete snapshot/IndexedDB path. During an active snapshot handoff, queue only that session's newer deltas and apply them by run sequence after the snapshot; refetch on reset, overflow, or incompatible revision.
- Rebuild lightweight metadata through authoritative session-list and active-run summaries after cursor reset; rehydrate detailed state only for currently materialized sessions.
- Keep browser tabs independent: switching a session in one tab changes only that tab's detail subscription and never affects another tab's stream.
- Preserve server authority: selection rehydration comes from snapshots plus cursor/sequence reconciliation, never from retained hidden deltas.

## Approach

- Introduce pure projection, materialization-policy, and channel-protocol contracts before changing transport ownership.
- Refactor publication and event application so per-tab filtering, cursor advancement, lightweight projection updates, and optional detailed reduction are separate operations.
- Connect UI visibility to explicit materialization leases and keep selection-triggered hydration generation-safe.
- Reuse current journal cursors, active-run snapshots, settled-session cache, revisions, and reset reconciliation rather than adding a second persistence protocol.
- Add bounded-memory and semantic-equivalence tests before enabling shared cross-tab transport.
- Implement replacement-connection handoff beneath the existing feed coordinator so session switches preserve one logical feed and do not expose transport churn to UI state.
- Close the work with repository-managed combined-preview browser coverage at test concurrency 1.

## Tasks

### 1 — Lightweight projection contracts

- [ ] Define session/run metadata schemas and a pure reducer for lifecycle, activity, interaction, revision, sequence, terminal, and cursor updates.
- [ ] Classify journal events as metadata-only or detail-bearing without changing their durable wire identity.
- [ ] Prove hidden transcript, thinking, and tool deltas update metadata without allocating detailed run state.
- Paths:
  - `src/stream/client/eventFeedStateCreate.ts`
  - `src/stream/client/eventFeedEventParse.ts`
  - `src/stream/schema/journalEventSchema.ts`
  - new `src/stream/client/eventFeedSessionProjectionStateCreate.ts`
  - new `src/stream/client/eventFeedEventMaterializationClassify.ts`
  - `test/eventFeedStateCreate.test.ts`
  - new `test/eventFeedSessionProjectionStateCreate.test.ts`

### 2 — Selective materialization and bounded eviction

- [ ] Add explicit acquire/release leases for visible sessions and a deterministic three-session LRU detail policy.
- [ ] Separate detailed run creation/reduction from metadata and cursor application.
- [ ] Evict transcript, thinking, and tool buffers while retaining metadata, revisions, sequence checkpoints, and settled durable caches.
- [ ] Expose bounded counters for materialized sessions/runs and omitted detail events through existing diagnostics.
- Paths:
  - `src/stream/client/eventFeedStateCreate.ts`
  - `src/ui/eventFeedCoordinatorContext.ts`
  - `src/ui/eventFeedCoordinatorStateCreate.ts`
  - `src/ui/sessionNavigationStateCreate.ts`
  - `src/ui/sessionDisplayModeStateCreate.ts`
  - `src/ui/streamActivityStateCreate.ts`
  - new `src/stream/client/eventFeedMaterializationPolicyCreate.ts`
  - `test/eventFeedStateCreate.test.ts`
  - `test/streamActivityStateCreate.test.ts`
  - new `test/eventFeedMaterializationPolicyCreate.test.ts`

### 3 — Selection-time rehydration and handoff

- [ ] Rehydrate newly materialized active sessions from active-run snapshots and settled sessions from complete snapshots/IndexedDB.
- [ ] Add generation, revision, and sequence guards so stale selection fetches cannot overwrite newer state.
- [ ] Queue only selected-session deltas during snapshot handoff, deduplicate by run sequence, and refetch after overflow/reset/incompatible revision.
- [ ] Preserve semantic equivalence across materialize, evict, rematerialize, reload, retry, cancellation, and finalization.
- Paths:
  - `src/run/api/runActiveSnapshotResponseSchema.ts`
  - `src/run/actions/runRepositoryActiveSnapshotLoad.ts`
  - `src/session/client/sessionSettledCacheStateCreate.ts`
  - `src/ui/sessionStreamStateCreate.ts`
  - `src/ui/sessionActiveRunReattachStateCreate.ts`
  - `src/ui/sessionChatConnectionCreate.ts`
  - `test/eventFeedActiveRunReload.test.ts`
  - `test/sessionSnapshotFeedHandoffIntegration.test.ts`
  - `test/sessionSettledCacheStateCreate.test.ts`
  - `test/sessionStreamStateCreate.test.ts`

### 4 — Replay and reset reconciliation

- [ ] Ensure all valid events advance the opaque user cursor whether or not their detailed payload is materialized.
- [ ] Rebuild the lightweight projection from authoritative session and active-run summaries after reset.
- [ ] Rehydrate details only for held materialization leases and retain non-visible settled caches.
- [ ] Cover interleaved visible/hidden session events, cursor expiry, duplicate frames, retries, cancellation, completion, and interaction state.
- Paths:
  - `src/events/client/eventFeedCreate.ts`
  - `src/events/api/apiEventsRoutesAdd.ts`
  - `src/session/api/apiSessionRoutesAdd.ts`
  - `src/session/client/sessionListStateCreate.ts`
  - `src/run/api/runActiveSummarySchema.ts`
  - `test/eventFeedCreate.test.ts`
  - `test/eventFeedActiveRunReload.test.ts`
  - `e2e/expiredCursorResetReconciliation.spec.ts`

### 5 — Per-tab dynamic detail subscriptions

- [ ] Extend the SSE request contract with a bounded, validated set of detail session IDs while retaining user-wide lightweight events.
- [ ] Filter live and replayed detail events per connection and emit cursor checkpoints after omitted journal ranges.
- [ ] Reconnect with the new detail set when materialization leases change, opening the replacement before closing the previous source and deduplicating overlap.
- [ ] Ensure reconnect, reset, logout, rapid switching, and failed replacement leave one healthy logical feed per tab.
- Paths:
  - `src/events/client/eventFeedCreate.ts`
  - `src/events/client/eventFeedOwnerRegistryCreate.ts`
  - `src/events/api/apiEventsRoutesAdd.ts`
  - `src/stream/actions/streamLiveSubscriptionCreate.ts`
  - `src/stream/actions/streamSseConnectionWriterCreate.ts`
  - `src/ui/signedInApplicationStateCreate.ts`
  - new `src/events/client/eventFeedDetailSubscriptionCreate.ts`
  - new `src/stream/actions/streamEventForSubscriptionResolve.ts`
  - new `test/eventFeedDetailSubscriptionCreate.test.ts`
  - new `test/streamEventForSubscriptionResolve.test.ts`

### 6 — Managed-preview integration closure

- [ ] Verify immediate background status/completion updates without hidden transcript allocation.
- [ ] Verify selected active and settled sessions rehydrate to the same semantic transcript as uninterrupted streaming.
- [ ] Verify every browser tab retains its own SSE connection and switching one tab changes only that tab's full-detail session set.
- [ ] Verify replacement connection handoff has no missed or duplicated visible detail during rapid switching and failed reconnects.
- [ ] Verify reload, cursor expiry, offline settled browsing, retries, cancellation, interactions, logout, and concurrent-tab convergence through the combined repository-managed preview.
- Paths:
  - `e2e/detachedRunReload.spec.ts`
  - `e2e/expiredCursorResetReconciliation.spec.ts`
  - `e2e/multipleTabsParallelRuns.spec.ts`
  - `e2e/settledSessionOfflineBrowsing.spec.ts`
  - new `e2e/hybridSessionMaterialization.spec.ts`
  - new `e2e/perTabEventFeedSubscription.spec.ts`
  - `ops/dev/`
