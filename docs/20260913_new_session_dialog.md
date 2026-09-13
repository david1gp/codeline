# New session dialog

## Goal
Integrate a T3 Code-inspired searchable new-session dialog into the existing application and expose the same functionality at `/demo/new-session-dialog`, linked from `/demo`.

## Decisions
- Preserve existing session creation flows and terminology.
- Show searchable entries with icon, name, and path, plus desktop keyboard navigation hints below.
- Use `@tanstack/solid-hotkeys`; clone its source to `~/opensource/tanstack-hotkeys` for lookup.
- Reuse existing generic `ui` components without modifying the read-only library.
- Build an app-owned generic searchable picker and reuse it in other existing suitable selection dialogs.
- Demo interactions use deterministic fixtures and do not create real sessions.
- Reuse targets are the files project selector and session project popover; preserve their existing loading/error and new-project flows.
- Reference: `~/opensource/t3code/apps/web/src/components/CommandPalette.tsx` new-thread project submenu. Existing session confirmation and new-project second step remain intact.

## Approach
Inspect the local T3 Code reference and current creation state, implement the shared picker in the production dialog, then expose it through the existing demo catalog. Verify focused tests and the combined repository-managed preview.

## Tasks
1. Completed: install the hotkeys dependency and clone its local source; identify the reference picker behavior and integration constraints.
2. Completed: implement the generic searchable picker integrated into the existing new-session dialog and focused behavior tests.
3. Completed: add the interactive demo route and catalog entry using the shared dialog; integrate the files project selector and session project popover.
4. Completed: verify types, focused tests, and demo browser interactions through managed preview; production integration covered by focused tests.
5. Completed: delegate conventional commits and deployment to fresh Luna subagents using the commits skill and repository deployment workflow.
