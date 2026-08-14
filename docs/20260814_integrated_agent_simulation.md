# Integrated agent simulation

## Goal

Make `/simulate` drive Codeline’s existing chat interface through the real session API, PostgreSQL persistence, stream replay, run/attempt lifecycle, and Zero synchronization while remaining deterministic and making no LLM provider calls.

## Decisions

- Reuse the production workspace, selected-session, message, and composer components instead of maintaining a parallel chat shell.
- Execute scenarios through `POST /api/sessions/:sessionId/chat` and the existing deterministic provider runtime; do not add a parallel simulation endpoint.
- Seed repository-owned deterministic agents and sessions idempotently so each direct `/simulate/*` scenario selects a real persisted session.
- Keep scenario fixtures synthetic and sanitized; never copy raw OpenCode transcripts or call network providers.
- Extend production transient chat presentation only where required to display thinking, tool activity, retries, cancellation, and errors that the current UI discards.
- Retain a compact simulation-only scenario/state inspector around the production interface so frontend transport state and synchronized backend run/attempt/event state can be compared.

## Approach

- Current context: implementation and verification are complete; all seven routes use the production workspace/composer and real local API, PostgreSQL, run/attempt/event persistence, replay, cancellation, and Zero reconciliation with no provider calls.
- Move deterministic scenario execution behind the existing provider runtime boundary and make it attempt-aware and abort-aware.
- Add deterministic fixture sessions through the existing checked-in seed workflow.
- Mount the same production state graph and chat components used by the main workspace, with scenario routes selecting the corresponding fixture session.
- Observe real frontend recovery state and Zero-synchronized backend state in a small simulation inspector without duplicating the transcript or composer.

## Tasks

- [x] 1. Implement backend deterministic runtime scenarios for streaming, thinking/tools, retry-success, retry-exhausted, terminal error, unexpected end, and cancellable execution through the normal provider/session stream path.
- [x] 2. Add idempotent seeded deterministic agents and sessions for the scenarios and route-to-session metadata.
- [x] 3. Replace the standalone `/simulate` chat shell with the production workspace/chat state and components, preserving direct scenario navigation.
- [x] 4. Render structured thinking/tool/retry/error activity in the production in-flight chat presentation and add a compact synchronized state inspector for simulation routes.
- [x] 5. Wire managed startup and the repository seed workflow to the configuration store so real run/attempt/retry/cancellation state persists.
- [x] 6. Add focused runtime, API persistence, route/state, and UI-state tests proving frontend and backend transitions.
- [x] 7. Seed through managed services and browser-verify all scenarios, persistence, Zero reconciliation, cancellation, retries, responsive behavior, accessibility, and absence of provider calls.

## Paths

- `src/providers/runtime/`
- `src/session/`
- `src/run/`
- `src/stream/`
- `src/database/exampleDataFixture.ts`
- `src/database/exampleDataSeed.ts`
- `src/configuration/`
- `src/server/serverStart.ts`
- `src/ui/simulate/`
- `src/ui/chatComposerStateCreate.ts`
- `src/ui/sessionChatStateCreate.ts`
- `src/ui/SessionChat.tsx`
- `src/ui/WorkspacePage.tsx`
- `src/ui/UiRouter.tsx`
- `test/`
