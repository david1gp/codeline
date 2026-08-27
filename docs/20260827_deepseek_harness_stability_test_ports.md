# DeepSeek Harness Stability Test Ports

## Goal

Increase Codeline stability with focused regression tests and lifecycle hardening adapted from DeepSeek Harness for cancellation, retry, provider-stream, polling, event-feed, shutdown, admission, and recovery races. Port observable guarantees rather than DeepSeek-specific runtime or fixture infrastructure.

## Decisions

- Extend existing Codeline test files and production seams; do not introduce a replay framework or alternate test server.
- Preserve Codeline contracts: SQLite-backed run/attempt state, canonical provider events, snapshot polling, opaque event cursors, and browser `EventSource` behavior.
- Test one race per increment with deterministic deferred promises or controlled fakes.
- Run tests with maximum concurrency 1; after a failure, rerun only the failing file or test.
- Keep graceful cleanup inside Codeline and retain systemd as the hard outer shutdown boundary; do not add another service or wrapper.
- Preserve the shutdown order: stop and drain HTTP/SSE before closing SQLite.
- Introduce an application shutdown deadline only below systemd's existing `TimeoutStopSec=30s`; systemd remains responsible for `SIGTERM`, final `SIGKILL`, and restart policy.
- Durable run and journal state remain authoritative; observer and SSE delivery failures must not block committed completion.
- Do not port ACP snapshot normalization, JSONL replay formats, Cordis scope lifecycle, or generic tool scheduling.

## Approach

- Reuse the existing SQLite fixtures in `test/runPersistence.test.ts` for repository-level concurrency.
- Reuse the injected provider fetch/stream seam in `test/providerRuntimeChatIntegration.test.ts`.
- Reuse the injected fetcher and `AbortSignal` in `test/sessionChatConnectionCreate.test.ts`.
- Reuse `FakeEventSource` and retained callbacks in `test/eventFeedCreate.test.ts`.
- Assert durable and externally visible outcomes: one terminal state, no duplicate attempt, no post-abort output, no invented completion, no post-close mutation, and no extra polling.
- Add shutdown behavior incrementally: ordering and idempotence first, then admission closure and bounded cleanup, then managed-service verification.
- Resolve parent/child and startup ownership races at the transactional or registry boundary rather than with timing delays.
- Isolate live publication errors after durable state and journal persistence so reconnecting clients can recover from backlog and cursors.

## Tasks

- [x] **1. Retry admission racing with cancellation**
  - Extend `test/runPersistence.test.ts`.
  - Race `runRetryAttemptCreate()` with `runCancel()` after attempt one fails.
  - Assert the repository cannot produce both cancellation and an active continuation, creates at most one retry attempt, and rejects any later duplicate retry.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/request-error.spec.ts` — search for cancellation winning over retry and retry after abort.
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/contract-regressions.spec.ts` — search for cancellation during error/retry settlement.
    - `~/opensource/deepseek-harness/packages/test-support/llm-replay/tests/llm-replay.spec.ts` — search for retry separation at error finishes.

- [x] **2. Cancellation racing with terminal persistence**
  - Extend `test/runPersistence.test.ts`.
  - Race `runCancel()` with `runTransition()` to `succeeded`, then independently to `failed`.
  - Assert one immutable terminal result, consistent run and attempt statuses, and metadata belonging only to the winning transition.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/contract-regressions.spec.ts` — search for close/finalize exactly once during cancellation.
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/coverage-edges.spec.ts` — search for balanced terminal boundaries and aborted/error finish mapping.
    - `~/opensource/deepseek-harness/packages/test-support/acp-snapshot/tests/harness.spec.ts` — search for persisted `turn/end` around cancellation.

- [x] **3. Provider abort after partial output**
  - Extend `test/providerRuntimeChatIntegration.test.ts`.
  - Emit one provider chunk, abort while the stream remains active, then attempt late output and a finish chunk.
  - Assert exactly one canonical interruption error, no `RUN_FINISHED`, no late output, and no leaked provider error details.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/test-support/llm-replay/tests/llm-replay.spec.ts` — search for `rejects a hang entry when the signal fires DURING the wait` and `aborting DURING a pace wait cancels the stream promptly`.
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/coverage-edges.spec.ts` — search for mid-stream failure classification and finish-aborted mapping.

- [x] **4. Abort pending chat polling and inter-poll delay**
  - Extend `test/sessionChatConnectionCreate.test.ts` with separate pending-fetch and pending-delay cases.
  - Abort the connection while a snapshot fetch is unresolved, then while waiting before the next poll.
  - Assert prompt generator termination, no success/error completion synthesized by cancellation, and no subsequent snapshot request.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/test-support/llm-replay/tests/llm-replay.spec.ts` — search for `rejects a hang entry when the signal fires DURING the wait`, `aborting DURING a pace wait cancels the stream promptly`, and the already-aborted signal case.

- [x] **5. Partial SSE disconnect without synthetic completion**
  - Extend `test/eventFeedCreate.test.ts`.
  - Deliver a valid partial event, simulate a non-auth transport error/EOF, and reopen the feed.
  - Assert partial state and cursor remain, status moves through reconnecting, and no completed, failed, or cancelled terminal state is invented.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/test-support/llm-mock-server/tests/server.spec.ts` — search for `stream_eof`, `partial_eof`, `stream_disconnect`, and `partial_disconnect`.

- [x] **6. Suppress late EventSource callbacks after close**
  - Extend `test/eventFeedCreate.test.ts`.
  - Retain event, open, and error callbacks; close the feed; invoke each callback afterward.
  - Assert the feed remains offline, no replacement source opens, no cursor or state changes, no callbacks escape, and the source closes exactly once.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/test-support/acp-snapshot/tests/harness.spec.ts` — search for `waits for in-flight client callbacks after the ACP stream closes`.

- [x] **7. Verify shutdown ordering and idempotence**
  - Extend `test/runtimeConfigurationParse.test.ts` around the injected server and database lifecycle seams in `src/server/serverStart.ts`.
  - Hold `server.stop(true)` on a deferred promise and assert SQLite remains open until it settles; cover stop rejection, database-close rejection, and racing `SIGTERM`/`SIGINT` without duplicate cleanup.
  - Preserve the production order: reject/stop new HTTP work, drain the server, then close the database and remove signal listeners.
  - Inspiration:
    - `~/opensource/deepseek-harness/apps/cli/tests/process-shutdown.spec.ts` — search for shutdown-call coalescing and graceful completion.
    - `~/opensource/deepseek-harness/packages/sdk/server/tests/plugin-apply.spec.ts` — search for racing shutdown requests and disposal after response flush.

- [x] **8. Add bounded application shutdown under systemd's deadline**
  - Extract the smallest injectable shutdown coordinator from `src/server/serverStart.ts`, with focused tests in a subject-matched file under `test/`.
  - On the first shutdown signal, reject new admission, abort cancellable provider/delegated work, await server drain and durable cleanup, and enforce an internal deadline shorter than 30 seconds.
  - On cleanup success or failure, settle once and preserve diagnostic failure information; do not call an untestable forced exit from shared cleanup code.
  - Keep `ops/dev/systemd/codeline-dev-api.service` as the integration boundary: systemd sends `SIGTERM`, waits at most `TimeoutStopSec=30s`, then owns final `SIGKILL` and `Restart=on-failure`. Change unit settings only if managed-service verification proves the existing budget is insufficient.
  - Verify with unit tests using deferred cleanup and controlled time, followed by the repository-managed combined preview service; do not launch an ad-hoc server.
  - Inspiration:
    - `~/opensource/deepseek-harness/apps/cli/src/process-shutdown.ts`.
    - `~/opensource/deepseek-harness/apps/cli/tests/process-shutdown.spec.ts` — search for timeout-bound disposal, first-signal drain, and second-signal force; adapt only the bounded-drain guarantee.
    - `~/opensource/deepseek-harness/packages/sdk/client/tests/dispose.spec.ts` — search for graceful shutdown followed by termination escalation.

- [x] **9. Prevent child admission after parent cancellation**
  - Extend `test/runChildAdmissionResolve.test.ts` and the nearest persistence/integration test covering `src/run/actions/runDelegationExecute.ts`.
  - Deterministically pause child admission after eligibility is observed, cancel the parent, then resume admission.
  - Assert an aborted or terminal parent cannot produce a newly active child, already-started children converge once, and repeated cancellation/admission attempts remain idempotent.
  - Move any required re-check into the transactional admission boundary instead of relying only on a preflight parent-state read.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/cancel.spec.ts` — search for queued work preservation, wake during abort-to-idle convergence, and tool-call cancellation.
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/tool-calls.spec.ts` — search for abort before dispatch and stopping sibling replenishment; adapt only parent/child admission guarantees.

- [x] **10. Separate startup reconciliation from active execution ownership**
  - Extend `test/runStartupInterruptionReconcile.test.ts` and `test/runActiveRegistry.test.ts` around `src/run/actions/runStartupInterruptionReconcile.ts` and the active-run registry.
  - Establish an ownership invariant: startup reconciliation repairs only persisted work abandoned by a previous process and never interrupts work registered to the current process.
  - Add deterministic tests for reconciliation before registration, registration during reconciliation, failed registration rollback, and duplicate ownership attempts.
  - Keep reconciliation before `Bun.serve` in `src/server/serverStart.ts`; introduce a lease or ownership token only if the current registry cannot express the invariant.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/scope-lifecycle.spec.ts` — search for concurrent same-ID creation, failed publication rollback, and owner cleanup.
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/config-session-id.spec.ts` — search for exact-ID duplicate rejection and cancellation of deferred resume.

- [x] **11. Isolate durable completion from observer and SSE failures**
  - Extend `test/runLifecycleEventFeedIntegration.test.ts`, `test/apiEventsRoutesAdd.test.ts`, and/or `test/streamSseConnectionWriter.test.ts` at the narrowest production publication seam.
  - Force one subscriber or observer to throw or disconnect while a run reaches success, failure, and cancellation.
  - Assert durable run/attempt state and journal events commit exactly once, healthy subscribers continue, the failed subscriber is isolated, and reconnect/backlog recovery returns the committed terminal event.
  - Keep persistence and journal append authoritative; perform best-effort live notification only after the durable boundary.
  - Inspiration:
    - `~/opensource/deepseek-harness/packages/core/agent-loop/tests/contract-regressions.spec.ts` — search for observers throwing during successful and error finalization.
    - `~/opensource/deepseek-harness/packages/sdk/server/tests/plugin-apply.spec.ts` — search for flush failure not preventing disposal.
    - `~/opensource/deepseek-harness/packages/sdk/server/tests/server.spec.ts` — search for teardown continuing after one disposer fails.

## Paths

- `test/runPersistence.test.ts`
- `test/providerRuntimeChatIntegration.test.ts`
- `test/sessionChatConnectionCreate.test.ts`
- `test/eventFeedCreate.test.ts`
- `test/runtimeConfigurationParse.test.ts`
- `test/runChildAdmissionResolve.test.ts`
- `test/runLifecycleEventFeedIntegration.test.ts`
- `test/runStartupInterruptionReconcile.test.ts`
- `test/runActiveRegistry.test.ts`
- `test/apiEventsRoutesAdd.test.ts`
- `test/streamSseConnectionWriter.test.ts`
- `src/run/db/runRepositoryCancel.ts`
- `src/run/db/runRepositoryRetryAttemptCreate.ts`
- `src/run/actions/runDelegationExecute.ts`
- `src/run/actions/runStartupInterruptionReconcile.ts`
- `src/server/serverStart.ts`
- `src/stream/client/eventFeedCreate.ts`
- `src/stream/actions/streamSseConnectionWriterCreate.ts`
- `ops/dev/systemd/codeline-dev-api.service`
- `~/opensource/deepseek-harness/packages/core/agent-loop/tests/request-error.spec.ts`
- `~/opensource/deepseek-harness/packages/core/agent-loop/tests/contract-regressions.spec.ts`
- `~/opensource/deepseek-harness/packages/core/agent-loop/tests/coverage-edges.spec.ts`
- `~/opensource/deepseek-harness/packages/test-support/llm-replay/tests/llm-replay.spec.ts`
- `~/opensource/deepseek-harness/packages/test-support/llm-mock-server/tests/server.spec.ts`
- `~/opensource/deepseek-harness/packages/test-support/acp-snapshot/tests/harness.spec.ts`
- `~/opensource/deepseek-harness/apps/cli/src/process-shutdown.ts`
- `~/opensource/deepseek-harness/apps/cli/tests/process-shutdown.spec.ts`
- `~/opensource/deepseek-harness/packages/sdk/client/tests/dispose.spec.ts`
- `~/opensource/deepseek-harness/packages/sdk/server/tests/plugin-apply.spec.ts`
- `~/opensource/deepseek-harness/packages/sdk/server/tests/server.spec.ts`
- `~/opensource/deepseek-harness/packages/core/agent-loop/tests/cancel.spec.ts`
- `~/opensource/deepseek-harness/packages/core/agent-loop/tests/tool-calls.spec.ts`
- `~/opensource/deepseek-harness/packages/core/agent-loop/tests/scope-lifecycle.spec.ts`
- `~/opensource/deepseek-harness/packages/core/agent-loop/tests/config-session-id.spec.ts`
