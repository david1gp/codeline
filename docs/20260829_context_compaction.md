# Context compaction

## Goal

Add reliable automatic and manual LLM context compaction to Codeline, preserving recent actionable context and tool-call integrity while supporting durable recovery and overflow retry.

## Decisions

- Adapt deepseek-harness's pre-request pressure check, overflow recovery, durable lifecycle, and prune-before-summary behavior to Codeline's existing session/message model.
- Adapt pi's reported-usage-first token accounting, safe cut-point behavior, structured rolling summary, file-context preservation, and truncated-summary safeguards.
- Keep compaction non-destructive: durable source history remains available while model context is reconstructed from the latest successful summary plus its retained tail.
- Use repository-managed services only and verify through the combined preview service.
- Keep configuration and commands consistent with existing Codeline patterns.

## Approach

- First map the current request loop, persistence model, provider usage metadata, commands, and configuration seams.
- Introduce independently tested compaction policy, estimation, boundary selection, serialization, and summary prompting.
- Add durable compaction state and model-context projection.
- Integrate pre-request pressure compaction, provider-overflow recovery with a bounded retry, and manual compaction.
- Add deterministic fixtures and focused unit, integration, and browser verification.

## Tasks

- [x] 1. Confirm integration seams and finalize affected paths.
- [x] 2. Implement and test pure compaction policy and context-selection primitives.
- [x] 3. Implement and test durable compaction persistence and context reconstruction.
- [x] 4. Implement and test summary generation and failure handling.
- [x] 5. Integrate automatic pressure handling, bounded overflow retry, configuration, and manual command.
- [x] 6. Verify focused tests, full checks, managed preview behavior, and browser flow.
- [x] 7. Review TypeScript and documentation changes and resolve findings.
- [ ] 8. Create conventional commits, push, and deploy.

## Paths

- `src/compaction/`
- `src/agents/schema/agentConfigurationSchema.ts`
- `src/providers/runtime/`
- `src/session/`
- `src/message/`
- `src/commands/`
- `src/configuration/`
- `src/database/databaseSchema.ts`
- `src/database/migrations/`
- `test/`
- `e2e/`
- `docs/20260829_context_compaction.md`

## Current context

- Durable history is complete and non-destructive; `sessionChatContextPrepare`, called by `sessionChatStreamCreate`, owns pre-request projection, while `apiSessionRoutesAdd` owns bounded outer overflow retry.
- Model context limits and valid reported usage now drive pressure decisions, with conservative estimation for unreported trailing context and fallback.
- Compaction must remain non-destructive and preserve complete assistant tool-call/result lifecycles.
- Pure policy, pressure, estimation, lifecycle-safe selection, bounded serialization, and rolling-summary prompt primitives now exist under `src/compaction/` with focused tests.
- Durable `session_compaction` lifecycle storage now supports authorized begin, success/failure finalization, one active operation per session, idempotency, and latest-successful lookup without modifying messages.
- Read-time reconstruction uses only the latest successful summary plus later finalized messages; no-compaction sessions retain exact full history. Durable messages contain user/assistant transcript rows, while delegated runtime compaction preserves complete in-memory tool-call/result lifecycles.
- Unrelated concurrent project-folder work owns migration `0012`; compaction owns migration `0011`. Do not modify or fold the project-folder files into this feature.
- Summary generation now coordinates safe selection, rolling prompts, bounded tool-free provider calls, durable begin/success/failure state, and rejects empty, aborted, errored, tool-emitting, or truncated results.
- Versioned agent configuration now exposes conservative compaction defaults and validated pressure, retention, reserve, summary, and overflow-retry settings.
- OpenAI-compatible provider failures now normalize context-window overflow to `provider_context_overflow`, which generic retries treat as terminal pending dedicated recovery.
- The outer chat request path now performs non-recursive pre-provider pressure compaction, reconstructs successful compacted context, and falls back safely without duplicating the prepared user message.
- Outer overflow recovery is revision-bound, advances context before retry, respects configured bounds, and does not consume generic retry admission or duplicate the user message.
- Literal `/compact` is reserved in the existing authenticated chat transport and invokes forced manual compaction without persisting or forwarding the control prompt.
- Delegated TanStack tool loops now pressure-check every provider round using lifecycle-safe in-memory projections and bounded pre-content overflow recovery without re-executing tools.
- Provider-reported usage is normalized, persisted, rejected when stale/invalid, and combined with estimates for trailing context.
- Deterministic managed compaction fixtures, transient `/compact` cleanup, repository boundary validation, concurrent adapter isolation, and durable manual-run failure recovery are covered by focused tests.
