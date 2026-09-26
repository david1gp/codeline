# Workspace configuration gate

## Goal

Replace the late “Select an available agent before sending” failure with a clear setup experience that keeps the new-conversation chat UI hidden until an executable agent target is available.

## Decisions

- Configuration is complete when server and agent discovery has produced a valid selected execution target.
- The gate applies to the new-conversation workspace; an already selected conversation remains readable and uses its persisted target.
- Loading, unavailable, empty, and failed discovery states are presented intentionally before the composer appears.
- Server selection remains hidden from the workspace.
- The setup surface supports agent choice and retry where the existing APIs allow it; it does not invent server/agent creation APIs or link to a nonexistent Settings route.
- Once a valid target is available, the normal send-to-create composer appears and keeps its existing automatic conversation creation behavior.

## Approach

- Expose a small configuration-readiness view contract from existing session-target state.
- Add an app-owned setup panel using the current pi-web-inspired workspace visual system.
- Gate only the no-selected-conversation chat surface and preserve selected-session history/chat behavior.
- Cover state transitions and rendering with focused tests and managed browser verification.

## Tasks

- [x] 1. Add configuration readiness state and view contracts for loading, ready, empty, and error states.
- [x] 2. Implement the workspace setup panel and gate the new-conversation chat UI until ready.
- [x] 3. Add focused tests and verify formatting, typecheck, full tests, build, and desktop/mobile behavior.

## Paths

- `src/ui/sessionTargetSelectorStateCreate.ts`
- `src/ui/SessionTargetSelector.tsx`
- `src/ui/WorkspacePage.tsx`
- `src/ui/SelectedSession.tsx`
- `src/ui/`
- `test/`
- `docs/20260815_workspace-configuration-gate.md`
