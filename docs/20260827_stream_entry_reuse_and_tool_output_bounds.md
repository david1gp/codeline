# Stream entry reuse and tool output bounds

## Goal

Reduce repeated UI derivation during long-running streamed sessions and prevent cumulative provider tool output from amplifying memory, journal, SSE, and replay costs.

## Decisions

- Optimize only the two demonstrated Codeline paths: stream-entry derivation and provider tool-output ingestion.
- Preserve stable `SessionStreamEntry` identity for unchanged durable events without caching stale group, run, delegation, or in-flight state.
- Key reusable entries by stable event identity plus every input that affects entry derivation; do not directly port T3 Code's activity-object `WeakMap` because Codeline reconstructs active event objects.
- Keep stream grouping and status derivation reactive while reusing only proven-unchanged normalized entries.
- Bound provider tool output before JSON serialization, journaling, and SSE publication, while retaining the existing producer coalescer and schema limits as defense in depth.
- Apply deterministic tail truncation with explicit truncation metadata; lifecycle terminal events must still be emitted immediately and tool-result semantics must remain valid.
- Add performance/regression tests adapted from the original T3 Code tests rather than copying implementation-specific code.
- Use T3 Code commit `fa219001dc2` as the entry-reuse reference and `afc8342801d4` as the cumulative-output reference.
- Keep CI/release optimization out of scope.
- Implement each feature before running or editing its tests; once testing begins, repair every failure rather than pre-running, ignoring, or classifying failures as unrelated.
- Run end-to-end tests only after all feature implementation is complete, then repair any failures before release.

## Approach

- Extract a bounded entry-reuse primitive or add a bounded cache at the derivation boundary, with explicit invalidation for changed normalized event content and contextual delegation/run inputs.
- Integrate reuse into durable stream derivation while leaving transient/in-flight rows and group state independently derived.
- Trace tool payloads from provider stream chunks through delta resolution, producer coalescing, schema normalization, journal persistence, and SSE publication.
- Normalize and bound cumulative or nested textual tool payloads at the earliest provider-independent boundary that preserves valid execution events.
- After implementation, measure derivation behavior with a large append-only stream and assert entry identity behavior separately from wall-clock thresholds.
- Verify both ordinary output and adversarial cumulative updates, including truncation metadata, terminal delivery, serialized size, event count, replay behavior, and existing coalescing.

## Tasks

- [x] 1. Implement bounded reuse of unchanged durable `SessionStreamEntry` values and integrate it with active feed updates without allowing stale groups, in-flight rows, statuses, ordering, or delegation links.
- [x] 2. After task 1 implementation, add focused coverage for large append-only stream derivation, unchanged identity, changed-event invalidation, and delegation/run-context invalidation; repair every failure.
- [x] 3. Implement provider-independent early bounding of cumulative and nested tool output with deterministic truncation metadata, preserving coalescing and immediate terminal events.
- [x] 4. After task 3 implementation, add coverage for normal calls, oversized and cumulative payloads, nested raw payloads, multibyte text, terminal success/failure, serialized and published bounds, replay, and coalescer flush behavior; repair every failure.
- [x] 5. Run remaining focused and relevant full test groups with concurrency 1 and repair every failure.
- [x] 6. Only after feature implementation, run and repair end-to-end coverage using the repository-managed combined preview service; verify long-session rendering and final streamed tool output in a browser.
- [ ] 7. Commit and push the completed work using the `/commits` skill, then deploy it to production. (Commit/push complete; deployment pending.)

## Current context

- Tasks 1–6 are complete. Four conventional commits were pushed to `origin/main`; production deployment is next.

## Paths

- `src/ui/sessionStreamGroupsDerive.ts`
- `src/ui/sessionStreamStateCreate.ts`
- `src/ui/sessionStreamDelegationResolve.ts`
- `src/ui/sessionStreamInFlightDerive.ts`
- `src/ui/SessionStreamEntryList.tsx`
- `src/stream/client/eventFeedStateCreate.ts`
- `src/events/client/eventFeedCreate.ts`
- `src/providers/runtime/providerExecutionEventFromStreamChunk.ts`
- `src/run/actions/runProviderOutputCreate.ts`
- `src/stream/actions/executionStreamEventNormalize.ts`
- `src/stream/actions/streamProducerCoalescerCreate.ts`
- `src/stream/schema/executionStreamEventSchema.ts`
- `src/journal/actions/journalWriteCreate.ts`
- `src/journal/actions/journalEventsAppendPersist.ts`
- `src/journal/actions/journalPostCommitPublishCreate.ts`
- `src/journal/actions/journalBacklogRead.ts`
- `src/journal/actions/journalBacklogEventFrameCreate.ts`
- `test/sessionStreamGroupsDerive.test.ts`
- `test/sessionStreamStateCreate.test.ts`
- `test/sessionStreamInFlightDerive.test.ts`
- `test/eventFeedStateCreate.test.ts`
- `test/eventFeedCreate.test.ts`
- `test/executionStreamEventNormalize.test.ts`
- `test/streamProducerCoalescer.test.ts`
- `test/runLifecycleEventFeedIntegration.test.ts`
- `test/apiEventsRoutesAdd.test.ts`
- `test/runActiveSnapshot.test.ts`
- `test/journalTask5DeltaCompaction.test.ts`
- T3 Code entry-reuse source: `/home/david/opensource/t3code/apps/web/src/session-logic.ts` at `fa219001dc2`; inspect `deriveWorkLogEntries`, `toDerivedWorkLogEntry`, `derivedWorkLogEntryByActivity`, and collapse/merge helpers.
- T3 Code entry-reuse tests: `/home/david/opensource/t3code/apps/web/src/session-logic.test.ts` at `fa219001dc2`; inspect `reuses entries for unchanged activities` and `updates 20,000 ordered tool activities within 100 ms`.
- T3 Code output-bound source: `/home/david/opensource/t3code/apps/server/src/provider/acp/AcpRuntimeModel.ts` at `afc8342801d4`; inspect `boundToolCallOutputText`, `boundToolCallRawOutput`, `boundToolCallRawPayload`, and `decideToolCallUpdateEmission`.
- T3 Code output-bound runtime integration: `/home/david/opensource/t3code/apps/server/src/provider/acp/AcpSessionRuntime.ts` at `afc8342801d4`; inspect `AcpToolCallTrackedState` and `handleSessionUpdate`.
- T3 Code output-bound tests: `/home/david/opensource/t3code/apps/server/src/provider/acp/AcpRuntimeModel.test.ts` at `afc8342801d4`; inspect the 8,000-character bound, ordered non-text retention, immediate terminal updates, equal-detail/title-change decisions, `[1, 11]` coalescing case, and 1,000-update/31 MB amplification regression capped at 114 events and 2.6 MB.
