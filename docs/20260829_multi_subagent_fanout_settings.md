# Multi-subagent fan-out and settings

## Goal

- Let one chat run create multiple sibling and nested subagents, with concurrent foreground fan-out.
- Default new root runs to `maxChildRuns: 100` and `maxChildDepth: 3`.
- Let users configure both limits from Settings and apply them to subsequently created root runs.
- Preserve durable admission, ordered tool results, cancellation, and bounded execution.

## Decisions

- `maxChildRuns` counts all descendants admitted across one root run tree; it is not a concurrency limit. Its default and maximum are `100`.
- `maxChildDepth` limits delegation levels below the root. Its default and maximum are `3`.
- Both settings allow `0`, so delegation can be disabled. Settings UI ranges are `0..100` child runs and `0..3` depth.
- Persist installation-wide values in an optional `settings.sessionRunBudget` section of configuration document version 1. Missing settings resolve to `100/3`, so existing documents remain valid.
- Read the latest configuration when creating each root run. Persisted budgets on existing runs never change retroactively, and deterministic runs retain their existing `maxAttempts` override.
- Keep the existing single-task `delegate_task` input and add a `tasks` batch form capped at four entries. Four is the foreground fan-out cap, independent of the total descendant budget of 100.
- Execute every admitted batch entry concurrently, settle every started entry, and present results in input order. One failed or rejected entry does not discard successful siblings.
- A caller abort cancels a child it created. Aborting a waiter that reused an existing child stops only that waiter and does not cancel or finalize the shared child.
- Use explicit small budgets in focused tests. Do not introduce hidden test-only defaults; tests of default resolution must assert the production defaults `100/3`.
- Keep `./ui` read-only and use `#ui/input/number/NumberInputS.jsx` from app-specific Settings UI.

## Approach

- Repair cancellation ownership and signal propagation before adding parallel child execution.
- Add fan-out inside one Codeline tool execution because separate TanStack AI server-tool calls are sequential.
- Use OpenCode's task/background-job implementation as a reference for independent child ownership, result collection, and cancellation, without adopting background or continuable agents in this feature.
- Use deepseek-harness as a reference for concurrency-safe subagent runs, `Promise.allSettled` settlement, and keeping sibling cleanup independent.
- Extend the persisted configuration and API, then resolve that configuration when creating root runs.
- Add an accessible Settings section with explicit save, loading, validation, error, and success states.
- Update model-facing schemas and delegation guidance only after runtime behavior is available.
- Cover contracts, persistence, concurrency, cancellation, API/state behavior, and the combined managed preview.

## Tasks

1. **Fix delegation cancellation**
   - Add the caller `AbortSignal` to `RunDelegationExecuteInput` and forward it from the session delegation callback.
   - Link abort to a newly owned child's controller and remove listeners during cleanup.
   - Make reused-child polling abortable without allowing the waiter to cancel or finalize the shared child.
   - Preserve exactly-once child finalization and prevent late provider results from replacing an aborted result.

2. **Add bounded foreground fan-out**
   - Extend the typed input to accept either the existing `{ task, agentId? }` shape or `{ tasks: [...] }`, with one to four entries.
   - Start all batch entries immediately and collect them with `Promise.allSettled`.
   - Derive a stable bounded delegation key from the outer tool-call ID and source index.
   - Associate and render results by source index rather than completion or database admission order.
   - Bound combined output fairly across entries and represent admission/execution failure per entry.
   - Preserve repository-level canonical task/agent deduplication.

3. **Add configurable production budget defaults**
   - Change `runBudgetSchema` defaults to `maxChildRuns: 100` and `maxChildDepth: 3`, and raise the child-run schema maximum from 8 to 100.
   - Add an optional configuration `settings.sessionRunBudget` contract containing only `maxChildRuns` and `maxChildDepth`.
   - Preserve settings whenever configuration reconciliation rewrites `agentConfigurations`.
   - Add `GET /api/configuration/settings` and `PATCH /api/configuration/settings`; PATCH validates, merges into the current snapshot, preserves agent configuration, and writes through `configurationStoreWrite`.
   - Resolve the current configured values for each new session root instead of using the hardcoded `1/1` budget.

4. **Expose run limits in Settings**
   - Add configuration-settings client operations and reactive state for load, edits, save, validation, errors, and saved status.
   - Add a “Subagent limits” section to Settings with labeled numeric controls for total descendant runs and maximum delegation depth.
   - Explain in the UI that limits apply to new runs and that child runs are a total tree budget, not a simultaneous-worker count.
   - Use `NumberInputS`, domain schema validation, associated labels/descriptions, and accessible status/error announcements.

5. **Update provider schema and documentation**
   - Update the provider JSON schema and tool description for backward-compatible single and batch inputs.
   - Document the four-entry concurrent batch cap, ordered settlement, per-entry failures, agent selection, and cancellation behavior.
   - Update agent delegation guidance to ask for one batch when independent tasks should run concurrently.

6. **Add focused and integration coverage**
   - Assert production schema defaults and boundaries while keeping explicit low budgets in admission, failure, and persistence scenarios.
   - Cover owned-child cancellation, reused-waiter cancellation, late result races, listener cleanup, and exactly-once finalization.
   - Prove all batch siblings start before release, staggered completion preserves source order, failures remain isolated, output remains bounded, and abort reaches every owned sibling.
   - Cover atomic concurrent admission through 100 descendants, rejection at 101, and unique root ordinals with test concurrency limited to one.
   - Cover configuration document compatibility, settings preservation during reconciliation, GET/PATCH validation and persistence, and root-run resolution from the latest settings.
   - Cover Settings state and accessible controls, then verify save/reload and a multi-subagent run through the repository-managed combined preview service with browser automation.

## Paths

- `src/run/schema/runBudgetSchema.ts`
- `src/run/actions/runChildAdmissionResolve.ts`
- `src/run/actions/runDelegationExecute.ts`
- `src/run/db/runRepositoryChildCreate.ts`
- `src/tools/schema/delegateTaskInputSchema.ts`
- `src/tools/runtime/delegateTaskToolCreate.ts`
- `src/providers/runtime/providerDelegationToolLoopCreate.ts`
- `src/session/api/apiSessionRoutesAdd.ts`
- `src/configuration/codelineConfigurationDocumentSchema.ts`
- `src/configuration/configurationStoreWrite.ts`
- `src/configuration/api/apiConfigurationRoutesAdd.ts`
- `src/configuration/api/configurationSettingsRequestSchema.ts`
- `src/configuration/api/configurationSettingsResponseSchema.ts`
- `src/configuration/client/`
- `src/database/exampleDataConfigurationReconcile.ts`
- `src/api/apiRoutesAdd.ts`
- `src/ui/settingsRoutePageStateCreate.ts`
- `src/ui/SettingsRoutePage.tsx`
- `src/ui/RunBudgetSettings.tsx`
- `agents/delegate.md`
- `test/runContracts.test.ts`
- `test/runChildAdmissionResolve.test.ts`
- `test/runDelegationExecute.test.ts`
- `test/runPersistence.test.ts`
- `test/providerDelegationToolLoopCreate.test.ts`
- `test/apiConfigurationRoutesAdd.test.ts`
- `test/configurationStore.test.ts`
- `test/apiSessionRoutesAdd.test.ts`
- `test/settingsRoutePageStateCreate.test.ts`
- `e2e/lunaSubagentThread.spec.ts`
- Reference: `~/opensource/opencode/packages/opencode/src/tool/task.ts`
- Reference: `~/opensource/opencode/packages/core/src/background-job.ts`
- Reference: `~/opensource/opencode/packages/opencode/src/session/run-state.ts`
- Reference: `~/opensource/deepseek-harness/packages/subagent/tool-subagent/src/index.ts`
- Reference: `~/opensource/deepseek-harness/packages/subagent/subagent/src/types.ts`
- Reference: `~/opensource/deepseek-harness/packages/subagent/subagent/src/run-settlement.ts`
- Reference: `~/opensource/deepseek-harness/packages/subagent/subagent-in-process-driver/src/index.ts`
