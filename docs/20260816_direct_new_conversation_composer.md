# Direct New Conversation Composer

## Goal

Let users begin typing immediately when no conversation is selected, while retaining execution-agent selection and readiness handling.

## Decisions

- Show the initial chat composer whenever execution configuration is ready.
- Keep the existing setup panel for loading, unavailable, and error states.
- Create the session on first message using the existing draft-first flow.
- Keep execution-agent selection visible in the initial composer.

## Approach

- Adjust the workspace no-selection gate to render the existing initial chat when ready.
- Pass execution-agent and provider/model state through to that initial chat.
- Replace selection-oriented empty copy with a direct conversation prompt.
- Cover the ready-state behavior with focused tests and browser verification.

## Tasks

- [x] 1. Implement the ready-state direct composer and focused automated tests.
- [x] 2. Verify the no-selection flow in the browser and fix only issues found in this flow.

## Current Context

- The ready workspace renders the draft-first composer with execution-agent and provider/model state.
- Automated checks and browser verification of message-driven session creation pass.

## Paths

- `src/ui/WorkspacePage.tsx`
- `src/ui/SelectedSession.tsx`
- `src/ui/SessionChat.tsx`
- `test/workspaceConfigurationGate.test.ts`
