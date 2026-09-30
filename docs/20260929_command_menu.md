# Command menu

## Goal

Add a T3Code-inspired command menu to Codeline's authenticated app. Ctrl/Cmd+K opens a searchable menu for common actions, registered projects, and sessions. Ctrl/Cmd+Shift+O starts the existing new-session flow (as explicitly requested). Preserve the existing project/session creation UI and route behavior.

## Decisions

- Mount the menu in the shared `App` shell so it works on Sessions, Files, Notes, Dashboard, and Settings, not just the workspace route. Keep app-specific UI in `src/ui`; `ui/` is read-only. Use existing `CorvuDialog`, `SearchablePicker`, and installed dependencies before adding anything.
- Include actions for New session, New project, and existing primary destinations. Search registered projects and sessions; selecting a session opens its detail route. Selecting a project starts a new session targeted at that project using existing session-target flow, not a fake project page. Keep keyboard labels platform-appropriate.
- Workspace action handlers are registered only while the workspace route is mounted. Route global actions to the workspace before dispatching them, with an explicit one-shot intent or equivalent route-aware mechanism; do not invoke an unregistered handler from another page. Project result selection must preserve its project ID across that transition. The direct `/sessions/new` route alone does not open the existing new-session dialog.
- Use existing session-list API search for session results rather than filtering only the sidebar's first page; support stale-request cancellation and pagination as appropriate. Project/action results remain local. Do not copy T3Code's file picker, content-search mode, shortcut customization, or cloning flow.
- Respect editable/composition contexts for Ctrl/Cmd+Shift+O so typing in a form is not interrupted. Ctrl/Cmd+K may open from editable fields. Menu dismissal, focus, and keyboard selection must work through existing primitives. Avoid changing pre-existing unrelated edits in the worktree.

## Tasks

1. **Global action/shortcut flow.** Introduce the smallest route-safe command dispatch or intent handling needed for new session, new project, and new session in a selected project, plus global Ctrl/Cmd+Shift+O handling. Add focused unit tests for shortcut matching and cross-route intent consumption. Keep `App` integration minimal until task 3.
2. **Menu data/search.** Implement app-owned menu state/helpers for action/project/session items and server-side session search using the existing API client. Ensure query changes cancel stale responses and paginated search is not limited to the sidebar's loaded sessions. Add focused unit tests; no broad suites.
3. **Menu UI.** Integrate a controlled command dialog in `App`, using existing generic components. Ctrl/Cmd+K toggles/opens it, with accessible search, empty/loading states, item selection, navigation and action dispatch. Add minimal styling consistent with current shell. Do not edit `ui/`.
4. **Verification.** Run focused tests at concurrency 1 and relevant typecheck, then verify keyboard shortcuts, project/session search and selection, action execution from a non-workspace route, and dialog keyboard behavior in the combined repository-managed preview service via a browser subagent. Repair only relevant failures.

## Current context

- T3Code's Ctrl/Cmd+Shift+O actually creates a new chat; its Add project action has no dedicated default shortcut. User chose the matching New session mapping and Actions + search scope.
- Existing workspace actions live in `src/ui/primaryNavigationStateCreate.ts` and are registered by `src/ui/workspaceScreenStateCreate.ts`; `src/ui/App.tsx` is the common authenticated shell.
- `src/session/client/sessionListPageLoad.ts` supports server-side `search`, `cursor`, `limit`, and abort `signal`. `src/ui/SearchablePicker.tsx` supplies accessible keyboard navigation and local filtering.
- Existing unrelated edits in `SessionSidebarNew.tsx`, `sessionSidebarNewPersistence.test.ts`, `sessionSidebarNewStateCreate.ts`, and `sessionsWorkspace.css` must be preserved.
- Task 1 added queue/consume command intents on workspace registration, preserving project ID, and a global Ctrl/Cmd+Shift+O shortcut matcher. Focused tests, typecheck, and formatting checks passed.
- Task 2 added menu item modeling and state with server-backed, cursor-paginated session search and request cancellation. Focused tests and typecheck passed.
- Task 3 mounted the searchable dialog in `App`, connected it to existing actions and route navigation, and adjusted the picker so server-matched sessions remain visible.
- Task 4 repaired menu search autofocus, project-target preservation, app-level New project dispatch and modal focus handoff, plus multiword local search. Managed preview browser checks confirmed Ctrl/Cmd+K, Ctrl/Cmd+Shift+O across routes, New project via mouse and keyboard, and project-target selection. Keyboard ArrowDown intentionally advances from the initially active first result. No session existed in the browser account to verify live session-result navigation.
- Final review identified that project menu data is an independent one-time snapshot and that signed-out cached browsing also mounts `App`; route the menu through the shared registry and scope it to authenticated mode. Ordinary New session must clear any prior project-target override.

## Status

- Task 1: complete
- Task 2: complete
- Task 3: complete
- Task 4: in progress (final review fixes and verification pending)
