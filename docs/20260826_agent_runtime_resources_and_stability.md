# Agent runtime resources and stability

## Goal

Add a small, deterministic agent-runtime foundation with normalized transcripts, runtime invariants, failure-injection coverage, hierarchical `AGENTS.md`, nested and preset-driven skills, explicitly enabled `bash` and `webfetch` tools, and `.agents/commands` expansion while preserving durable runs, bounded subagents, replayable SSE, and immutable execution snapshots.

## Decisions

- Resolve all session choices before creating a session and persist the effective configuration in immutable root, attempt, and child run snapshots.
- Keep deterministic runtime tests in the normal suite; do not add probabilistic real-model evaluation gates or a general evaluation framework.
- Normalize semantic transcript content without IDs, timestamps, cursors, provider chunk boundaries, or timing data; avoid large persisted golden snapshot collections.
- Add runtime invariant diagnostics to existing simulation and metrics paths instead of creating a second inspection subsystem.
- Discover only `AGENTS.md`: global `~/.agents/AGENTS.md`, project ancestry/root instructions, and nested project instructions scoped to descendant working paths. Do not load `CLAUDE.md`.
- Snapshot resolved instruction content and digests when the session is created. Baseline instructions are injected immediately; nested instructions are selected from the snapshot for a tool working directory.
- Discover skills recursively from project `.agents/skills/**/SKILL.md` and global `~/.agents/skills/**/SKILL.md`. A skill is identified by frontmatter `name`; project entries override global entries and collisions remain visible in inspection data.
- Treat every directory below a skill root as a group. Activating a parent includes descendant skills. Individual skills can be enabled or disabled after folder expansion.
- Store checked-in project presets under `.agents/skill-presets/*.yaml`. A preset contains included folders, included skills, and excluded skills; exclusions win. Persist each user's default per project while allowing a pre-session override.
- Apply the selected skill preset session-wide to the root and descendants. Store active skill metadata and full content in the immutable session execution manifest. Inject only active skill names/descriptions/locations; load full `SKILL.md` content on demand through the `skill` tool.
- Estimate active skill catalog context as `ceil(rendered description catalog characters / 4)` tokens and label it as an estimate.
- Configure tool enablement for primary agents and every selectable subagent. The pre-session UI resolves effective tool sets; child snapshots capture the selected child agent's effective set.
- Support only model-facing `bash` and `webfetch` in this scope, plus the internal `skill` and existing `delegate_task` tools. Do not add `glob`, `grep`, `websearch`, edit, or write tools.
- Do not add tool permission or approval flows. Disabled tools are not advertised and cannot execute; enabled tools execute with bounded timeout/output and structured lifecycle events.
- Discover commands recursively from project `.agents/commands/**/*.md` and global `~/.agents/commands/**/*.md`, with project commands taking precedence.
- Support `$ARGUMENTS`, `$1`…`$N`, quoted and multiline arguments, implicit argument append when no placeholder exists, and command frontmatter for description, agent, model, and subtask selection.
- Allow `!`command`` interpolation only through the same enabled, bounded `bash` runtime. Expansion fails clearly when `bash` is disabled. Persist expanded user text plus command identity and template digest, not an executable template reference alone.
- After every phase: run focused checks with test concurrency 1, verify the combined repository-managed preview, delegate the `/commits` skill to a fresh Luna subagent to split conventional commits (including pre-existing unrelated changes where appropriate), push, run `bun run deploy`, and verify `https://preview.codeline.work` before continuing.

## Approach

- Current context: Phase 1 implementation and full checks pass. A deployed cancellation-inspector convergence defect was corrected through the existing reconciliation refresh seam; its follow-up publish and deployed verification are in progress.
- Build pure schemas, resolvers, and projections before connecting provider loops or UI.
- Extend `RunExecutionSnapshot` with a versioned execution manifest containing instructions, active skills, command catalog identity, and effective per-agent tools.
- Use one typed tool registry for `skill`, `bash`, `webfetch`, and `delegate_task`; retain the existing provider event and durable tool-activity protocol.
- Load filesystem resources through server-owned, project-root-aware services and typed APIs; do not let the browser scan paths directly.
- Reuse existing configuration, session creation, project browsing, query, simulation, journal, and run persistence patterns.
- Port narrowly scoped contract cases from OpenCode, DeepSeek Harness, and Pi Web rather than importing their runtime architecture.

## Tasks

### Phase 1 — Semantic transcript and deterministic runtime baseline

Status: complete; publishing.

- [x] Add a pure transcript normalizer that folds normalized provider/run events into stable ordered assistant text, thinking/tool lifecycle, attempt boundaries, cancellation/failure, and terminal outcome while excluding volatile transport fields.
- [x] Assert invariants for authoritative attempt selection, stream isolation, one terminal outcome, no failed-attempt text leakage, no tool/thinking leakage into assistant text, and deterministic duplicate-terminal handling.
- [x] Extend deterministic scenarios for abort-before-event, abort/event race, abort-after-terminal, retry stream replacement, incomplete tool lifecycle, unexpected end, and duplicate/out-of-order terminal input.
- [x] Extend existing inspector derivation to expose invariant violations, authoritative attempt/stream, terminal reason, cancellation state, and persisted event counts without adding a new inspector framework.
- Codeline paths:
  - `src/stream/actions/executionStreamEventNormalize.ts`
  - `src/providers/runtime/providerDeterministicScenarioFixture.ts`
  - `src/providers/runtime/providerDeterministicScenarioResolve.ts`
  - `src/run/actions/runProviderOutputCreate.ts`
  - `src/ui/simulate/simulateInspectorBackendStateDerive.ts`
  - `src/ui/simulate/simulateInspectorStateCreate.ts`
  - new `src/run/actions/executionTranscriptNormalize.ts`
  - `test/executionStreamEventNormalize.test.ts`
  - `test/providerDeterministicScenarioResolve.test.ts`
  - `test/runContracts.test.ts`
  - `test/simulateInspectorStateCreate.test.ts`
  - new `test/executionTranscriptNormalize.test.ts`
- Inspiration and portable tests:
  - DeepSeek Harness `packages/test-support/llm-replay/src/index.ts`
  - DeepSeek Harness `packages/core/agent-loop/tests/request-reconstruction.spec.ts`
  - DeepSeek Harness `packages/core/agent-loop/tests/resume.spec.ts`
  - Pi Web `lib/agent-event-stream.test.mjs`
  - Pi Web `lib/agent-event-wire.test.mjs`
  - Pi Web `lib/streaming-message.test.mjs`

### Phase 2 — Versioned execution manifest and typed tool registry

Status: pending Phase 1 foundations; schema and registry contracts may proceed independently once Phase 1 increments are integrated.

- [ ] Define a versioned execution manifest for resolved instructions, active skill snapshots, command catalog digest, and effective tool names for the primary and selectable subagents.
- [ ] Extend session creation so the pre-session choices are validated and captured before session insertion, then copied into root, attempt, retry, and child snapshots.
- [ ] Add a typed tool registry contract with strict input/output schemas, abort propagation, timeout/output bounds, structured failures, and existing provider tool-event compatibility.
- [ ] Adapt `delegate_task` to the registry without changing delegation budgets, idempotency, cancellation, or durable child lifecycle.
- [ ] Add configuration schemas for per-agent `bash`/`webfetch` defaults and a user/project default-selection persistence seam; do not add permission rules.
- Codeline paths:
  - `src/session/schema/sessionCreateRequestSchema.ts`
  - `src/session/actions/sessionCreate.ts`
  - `src/session/api/apiSessionRoutesAdd.ts`
  - `src/session/db/sessionTable.ts`
  - `src/run/schema/runExecutionSnapshotSchema.ts`
  - `src/run/actions/runExecutionSnapshotResolve.ts`
  - `src/run/db/runRepositoryCreate.ts`
  - `src/run/db/runRepositoryChildCreate.ts`
  - `src/run/db/runTable.ts`
  - `src/run/db/attemptTable.ts`
  - `src/agents/schema/agentCatalogFrontmatterSchema.ts`
  - `src/configuration/codelineConfigurationDocumentSchema.ts`
  - `src/providers/runtime/providerDelegationToolLoopCreate.ts`
  - new `src/tools/schema/toolNameSchema.ts`
  - new `src/tools/runtime/toolRegistryCreate.ts`
  - new `src/session/schema/sessionExecutionSelectionSchema.ts`
  - database migration under `src/database/migrations/`
- Inspiration and portable tests:
  - DeepSeek Harness `packages/core/tools/src/index.ts`
  - DeepSeek Harness `packages/core/tools/src/schema.ts`
  - DeepSeek Harness `packages/core/tools/src/json-schema.ts`
  - OpenCode `packages/core/src/tool/`
  - Existing Codeline `test/runContracts.test.ts`
  - Existing Codeline `test/runPersistence.test.ts`
  - Existing Codeline `test/runDelegationExecute.test.ts`

### Phase 3 — Hierarchical `AGENTS.md` snapshots

Status: pending Phase 2 manifest contract.

- [ ] Implement deterministic discovery for `~/.agents/AGENTS.md`, project ancestry/root `AGENTS.md`, and nested project `AGENTS.md` files with canonical paths, precedence, deduplication, hashes, byte budgets, and explicit validation diagnostics.
- [ ] Resolve and snapshot instruction contents during pre-session configuration; render global-to-local baseline instructions in stable order.
- [ ] Resolve nested instruction overlays from the immutable snapshot for `bash` working directories and carry newly relevant scoped instructions into the next model turn.
- [ ] Expose an authenticated inspection API showing source, scope, digest, size, precedence, and validation status without exposing paths outside the permitted project/global roots.
- Codeline paths:
  - new `src/instructions/actions/agentInstructionsDiscover.ts`
  - new `src/instructions/actions/agentInstructionsSnapshotResolve.ts`
  - new `src/instructions/actions/agentInstructionsForPathResolve.ts`
  - new `src/instructions/schema/agentInstructionSnapshotSchema.ts`
  - new `src/instructions/api/apiAgentInstructionRoutesAdd.ts`
  - `src/project/projectTextRead.ts`
  - `src/project/api/apiProjectRoutesAdd.ts`
  - `src/run/actions/runExecutionSnapshotResolve.ts`
  - `src/run/schema/runExecutionSnapshotSchema.ts`
  - `src/api/apiRoutesAdd.ts`
  - new `test/agentInstructionsDiscover.test.ts`
  - new `test/agentInstructionsSnapshotResolve.test.ts`
- Inspiration and portable tests:
  - DeepSeek Harness `packages/context/agent-instructions/src/files.ts`
  - DeepSeek Harness `packages/context/agent-instructions/src/state.ts`
  - DeepSeek Harness `packages/context/agent-instructions/src/render.ts`
  - DeepSeek Harness `packages/context/agent-instructions/src/digest.ts`
  - DeepSeek Harness `packages/context/agent-instructions/tests/agent-instructions.spec.ts`
  - OpenCode `packages/core/src/instruction-context.ts`

### Phase 4 — Recursive skills, groups, presets, and runtime loading

Status: pending Phase 2 manifest and tool-registry contracts; may run in parallel with Phase 3.

- [ ] Discover and validate recursive global/project `SKILL.md` bundles, resources relative to each bundle directory, stable identities, precedence, collisions, and diagnostics.
- [ ] Model folder groups as relative directory paths and resolve preset includes/excludes deterministically, with parent recursion and individual exclusions taking precedence.
- [ ] Parse checked-in `.agents/skill-presets/*.yaml`; persist user/project default preset and individual overrides; produce an immutable active-skill snapshot at session creation.
- [ ] Render the active skill description catalog and estimated tokens using `ceil(renderedCharacters / 4)`.
- [ ] Register an internal `skill` tool that lists only active skills and loads snapshotted full instructions/resources on demand.
- Codeline paths:
  - new `src/skills/actions/skillCatalogDiscover.ts`
  - new `src/skills/actions/skillPresetCatalogLoad.ts`
  - new `src/skills/actions/skillSelectionResolve.ts`
  - new `src/skills/actions/skillDescriptionCatalogRender.ts`
  - new `src/skills/schema/skillFrontmatterSchema.ts`
  - new `src/skills/schema/skillPresetSchema.ts`
  - new `src/skills/schema/skillSnapshotSchema.ts`
  - new `src/skills/runtime/skillToolCreate.ts`
  - new `src/skills/api/apiSkillRoutesAdd.ts`
  - `src/project/projectDirectoryList.ts`
  - `src/project/projectTextRead.ts`
  - `src/run/actions/runExecutionSnapshotResolve.ts`
  - `src/tools/runtime/toolRegistryCreate.ts`
  - database migration under `src/database/migrations/`
  - new `test/skillCatalogDiscover.test.ts`
  - new `test/skillSelectionResolve.test.ts`
  - new `test/skillToolCreate.test.ts`
- Inspiration and portable tests:
  - OpenCode `packages/opencode/src/skill/index.ts`
  - OpenCode `packages/opencode/src/tool/skill.ts`
  - OpenCode `packages/opencode/test/skill/skill.test.ts`
  - DeepSeek Harness `packages/skill/skill-filesystem/src/index.ts`
  - DeepSeek Harness `packages/skill/skill-filesystem/tests/skill-filesystem.spec.ts`
  - DeepSeek Harness `packages/skill/tool-skill/src/index.ts`
  - DeepSeek Harness `packages/skill/tool-skill/tests/tool-skill.spec.ts`
  - Pi Web `app/api/skills/route.ts`
  - Pi Web `lib/skill-lock.test.mjs`

### Phase 5 — Pre-session resource and skill inspection UI

Status: pending Phases 2–4 API contracts.

- [ ] Extend the pre-session workspace to choose a preset, recursively toggle folders, override individual skills, and show the effective skill list and estimated description-catalog context before session creation.
- [ ] Add an inspector for global/project roots, nested groups, skill metadata/content/resources, collisions, validation errors, preset source, and effective activation.
- [ ] Add primary-agent and subagent tool toggles for only `bash` and `webfetch`, seeded from agent defaults and captured in the pending session selection.
- [ ] Display immutable selected preset, active skills, instruction sources, and effective tools for an existing session without allowing mutation.
- [ ] Reuse `#ui` selectors, checks, switches, dialogs, details, and tabs; keep application state and views under `src/ui`.
- Codeline paths:
  - `src/ui/sessionInitialMessageStateCreate.ts`
  - `src/ui/SessionChat.tsx`
  - `src/ui/NewSessionDialog.tsx`
  - `src/ui/WorkspaceSetupPanel.tsx`
  - `src/ui/SessionTargetSelector.tsx`
  - `src/ui/sessionTargetSelectorStateCreate.ts`
  - `src/ui/sessionTargetConfigurationView.ts`
  - `src/ui/SettingsRoutePage.tsx`
  - `src/api/client/apiHttpClientCreate.ts`
  - `src/api/client/apiQueryKeyCreate.ts`
  - new `src/ui/SessionResourceSelector.tsx`
  - new `src/ui/sessionResourceSelectorStateCreate.ts`
  - new `src/ui/SkillCatalogInspector.tsx`
  - `ui/input/select/SelectSingle.tsx`
  - `ui/input/check/CheckBooleanSingle.tsx`
  - `ui/input/switch/SwitchSingle.tsx`
  - `ui/interactive/details/Details.tsx`
  - new focused unit tests under `test/`
  - new `e2e/sessionResourceSelection.spec.ts`
- Inspiration and portable tests:
  - Pi Web `components/SkillsConfig.tsx`
  - Pi Web `components/ChatInput.tsx`
  - Pi Web `app/api/skills/route.ts`
  - Pi Web `lib/project-trust.test.mjs` for deterministic catalog state only, excluding trust/permissions
  - OpenCode `packages/app/src/utils/agent.ts`

### Phase 6 — Bounded `bash` tool

Status: pending Phase 2 tool registry and Phase 3 instruction snapshots; may run in parallel with Phase 7 afterward.

- [ ] Implement `bash` through the typed registry with command, optional project-descendant working directory, bounded timeout, abort propagation, bounded/truncated structured output, exit code, and stable tool events.
- [ ] Advertise and execute `bash` only when enabled in the current immutable agent snapshot; do not add approvals or persisted permission decisions.
- [ ] Apply snapshotted nested `AGENTS.md` overlays for the declared working directory to subsequent model context.
- [ ] Test cancellation while waiting for output, timeout, truncation, nonzero exit, invalid working directory, disabled-tool rejection, retry isolation, and terminal races.
- Codeline paths:
  - new `src/tools/runtime/bashToolCreate.ts`
  - new `src/tools/actions/bashExecute.ts`
  - new `src/tools/schema/bashToolInputSchema.ts`
  - `src/tools/runtime/toolRegistryCreate.ts`
  - `src/providers/runtime/providerDelegationAdapterCreate.ts`
  - `src/providers/runtime/providerDelegationToolLoopCreate.ts`
  - `src/run/actions/runProviderOutputCreate.ts`
  - `src/instructions/actions/agentInstructionsForPathResolve.ts`
  - new `test/bashExecute.test.ts`
  - new `test/bashToolCreate.test.ts`
  - `test/runCancellationCoordinator.test.ts`
- Inspiration and portable tests:
  - OpenCode `packages/core/src/tool/bash.ts`
  - OpenCode `packages/core/test/tool-bash.test.ts`
  - Pi Web `lib/pi-types.ts` bash execution/cancellation contract

### Phase 7 — Bounded `webfetch` tool

Status: pending Phase 2 tool registry; may run in parallel with Phase 6.

- [ ] Implement HTTP(S)-only fetch with text/Markdown/HTML formats, redirect handling, content-type validation, response-size and timeout limits, abort propagation, HTML conversion, and structured failures.
- [ ] Advertise and execute `webfetch` only when enabled in the immutable current-agent snapshot; do not add approvals, web search, or arbitrary provider-native search.
- [ ] Add deterministic HTTP fixtures for redirects, malformed URLs, unsupported content, conversion, timeout, cancellation, truncation, disabled-tool rejection, and replay-safe lifecycle events.
- Codeline paths:
  - new `src/tools/runtime/webfetchToolCreate.ts`
  - new `src/tools/actions/webfetchExecute.ts`
  - new `src/tools/schema/webfetchToolInputSchema.ts`
  - `src/tools/runtime/toolRegistryCreate.ts`
  - `src/providers/runtime/providerDelegationAdapterCreate.ts`
  - `src/run/actions/runProviderOutputCreate.ts`
  - new `test/webfetchExecute.test.ts`
  - new `test/webfetchToolCreate.test.ts`
- Inspiration and portable tests:
  - OpenCode `packages/core/src/tool/webfetch.ts`
  - OpenCode `packages/core/test/tool-webfetch.test.ts`
  - DeepSeek Harness web tool packages under `packages/web/`

### Phase 8 — `.agents/commands` discovery, expansion, and composer UX

Status: pure discovery and expansion may begin after Phase 2 contracts; shell interpolation waits for Phase 6.

- [ ] Discover recursive global/project Markdown commands with frontmatter validation, precedence, collisions, stable digests, and typed inspection API responses.
- [ ] Add a pure command parser/expander for `$ARGUMENTS`, positional placeholders, quoting, multiline input, implicit append, agent/model/subtask metadata, and deterministic errors.
- [ ] Execute `!`command`` substitutions through the enabled `bash` tool with its same working directory, timeout, output, abort, and event behavior; reject interpolation when `bash` is disabled.
- [ ] Add slash-command autocomplete and detail preview to the pre-session/existing-session composer; submit expanded text through the normal chat path and persist command identity/template digest in message or run metadata.
- [ ] Ensure all agent/model/subtask overrides are validated before a new session is created and then captured in its immutable selection/snapshot.
- Codeline paths:
  - new `src/commands/actions/commandCatalogDiscover.ts`
  - new `src/commands/actions/commandExpand.ts`
  - new `src/commands/actions/commandShellInterpolationResolve.ts`
  - new `src/commands/schema/commandFrontmatterSchema.ts`
  - new `src/commands/api/apiCommandRoutesAdd.ts`
  - `src/ui/sessionInitialMessageStateCreate.ts`
  - `src/ui/SessionChat.tsx`
  - `src/ui/sessionChatStateCreate.ts`
  - `src/ui/sessionChatConnectionCreate.ts`
  - `src/session/schema/sessionChatRequestSchema.ts`
  - `src/session/api/apiSessionRoutesAdd.ts`
  - new `src/ui/ChatCommandSuggestions.tsx`
  - new `test/commandCatalogDiscover.test.ts`
  - new `test/commandExpand.test.ts`
  - new `e2e/chatCommandExpansion.spec.ts`
- Inspiration and portable tests:
  - OpenCode `packages/opencode/src/config/command.ts`
  - OpenCode `packages/opencode/src/command/index.ts`
  - OpenCode `packages/opencode/src/session/prompt.ts`
  - OpenCode `packages/opencode/test/session/prompt.test.ts`
  - OpenCode `packages/tui/src/component/prompt/index.tsx`
  - Pi Web `components/ChatInput.tsx`

### Phase 9 — Failure injection, reload equivalence, and integrated stability closure

Status: pending integrated completion of Phases 1–8.

- [ ] Add injectable persistence seams for assistant-message insertion, journal publication, delta deletion, run transition, retry-attempt creation, cancellation, and delegation finalization.
- [ ] Assert transaction rollback, no phantom finalized messages, retained replayable deltas, idempotent recovery, one terminal state, cancellation/completion races, retry admission races, and finalization retry behavior.
- [ ] Compare normalized semantic transcripts before reload, after snapshot/SSE handoff, and after finalization for streaming, thinking/tool, retry, cancellation, and command/tool scenarios.
- [ ] Add managed-preview browser coverage for reload during tool activity, retry, cancellation after reload, immutable resource selection, and concurrent-tab convergence.
- [ ] Keep real-provider integration opt-in and non-gating; deterministic scenarios remain the release stability gate.
- Codeline paths:
  - `src/journal/`
  - `src/eventFeed/`
  - `src/run/actions/runDelegationExecute.ts`
  - `src/run/actions/runDelegationFinalize.ts`
  - `src/run/db/runRepositoryDelegationFinalize.ts`
  - `src/run/db/runRepositoryRetryAttemptCreate.ts`
  - `src/run/db/runRepositoryCancel.ts`
  - `src/run/db/runRepositoryActiveSnapshotLoad.ts`
  - `test/journalTask5DeltaCompaction.test.ts`
  - `test/runPersistence.test.ts`
  - `test/runDelegationExecute.test.ts`
  - `test/runCancellationCoordinator.test.ts`
  - `test/runActiveSnapshot.test.ts`
  - new `test/runFinalizationFailure.test.ts`
  - `e2e/detachedRunReload.spec.ts`
  - `e2e/expiredCursorResetReconciliation.spec.ts`
  - `e2e/multipleTabsParallelRuns.spec.ts`
  - new `e2e/retryCancellationReload.spec.ts`
- Inspiration and portable tests:
  - DeepSeek Harness `packages/core/session/tests/repair.spec.ts`
  - DeepSeek Harness `packages/core/agent-loop/tests/resume.spec.ts`
  - DeepSeek Harness `packages/test-support/llm-replay/src/index.ts`
  - Pi Web `lib/session-reader.test.mjs`
  - Pi Web `lib/prompt-recovery.test.mjs`
