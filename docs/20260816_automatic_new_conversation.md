# Automatic New Conversation

## Goal

Automatically create and select a blank conversation when the new-conversation route has a valid execution agent, enabling model selection before the first message.

## Decisions

- Materialize a conversation as soon as a valid default or explicitly selected execution agent is ready.
- Reuse the existing idempotent session creation path.
- Do not send an assistant request until the user submits a message.
- Prevent duplicate creation and ignore stale creation results after target changes or disposal.
- Remove pre-session provider/model placeholder behavior from the normal ready flow.

## Approach

- Add a guarded automatic-creation lifecycle to execution-target state.
- Share creation state with the existing send-triggered fallback to avoid races.
- Navigate directly from the new route to the created blank conversation.
- Update focused state and UI tests, then verify the complete flow in a browser.

## Tasks

- [x] 1. Implement guarded automatic session creation with focused state tests.
- [x] 2. Align new-conversation UI copy and focused UI tests with the automatic transition.
- [x] 3. Verify automatic creation, model selection, and first-message submission in the browser.

## Current Context

- Route-gated automatic creation now shares an in-flight create operation with the send fallback.
- Target-generation and disposal guards prevent stale selection; focused and full state tests pass.
- The transient no-session UI now communicates automatic preparation without asking the user to start or select a conversation.
- Browser verification confirms model selection before typing and first-message submission in the same automatically created conversation without duplicates.

## Paths

- `src/ui/sessionTargetSelectorStateCreate.ts`
- `src/ui/sessionInitialMessageStateCreate.ts`
- `src/ui/SelectedSession.tsx`
- `src/providers/ui/ProviderModelSelector.tsx`
- `test/sessionTargetSelectorStateCreate.test.ts`
- `test/ProviderModelSelector.test.ts`
