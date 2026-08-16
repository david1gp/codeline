# Session display mode

## Goal

Add a global, persistent session display toggle so users can switch every session between the current conversation view and a stream view that exposes all available messages, thinking blocks, and tool/activity events.

## Decisions

- The setting applies globally across sessions.
- The setting persists across page reloads until the user changes it.
- The current conversation presentation remains the default.
- The toggle belongs in the selected-session header.
- Stream view uses the existing session and execution stream data rather than introducing a parallel backend protocol.
- Persisted event identity is `(streamId, sequence)`; retries remain distinct.
- Cross-stream display order uses run creation, run identity, attempt ordinal, stream identity, event sequence, and event identity as deterministic keys.
- Finalized messages and stream events remain distinct records because the current schema has no reliable message-to-stream association.

## Approach

- Identify the repository's established persisted UI-preference pattern and the complete event data available to session views.
- Add a typed global display-mode preference and header toggle.
- Add a stream-oriented renderer for durable and in-flight message, thinking, and tool/activity content.
- Keep composer, cancellation, recovery, and finalized conversation behavior unchanged.
- Verify persistence, session switching, live streaming, and both display modes in the browser.

## Tasks

- [x] 1. Confirm preference-storage conventions, stream event lifecycle, and exact integration paths.
- [x] 2. Implement the persistent global display-mode state and session-header toggle.
- [x] 3. Implement stream-mode rendering for available finalized and in-flight content.
- [x] 4. Add or update focused automated tests.
- [x] 5. Verify both modes and persistence in the running application.
- [ ] 6. Review the completed change for correctness and scope.

## Paths

- `src/ui/SelectedSession.tsx`
- `src/ui/SessionChat.tsx`
- `src/ui/selectedSessionStateCreate.ts`
- `src/ui/sessionChatStateCreate.ts`
- `src/ui/streamActivityStateCreate.ts`
- `src/ui/sessionDisplayModeStateCreate.ts`
- `src/ui/SessionDisplayModeSwitcher.tsx`
- `src/message/ui/`
- `src/stream/`
- `src/ui/**/*.test.*`
