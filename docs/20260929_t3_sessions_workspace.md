# T3-style sessions workspace

## Goal

Preserve the current Codeline sessions workspace at `/sessions-legacy` and replace `/sessions` with a T3 Code-inspired whole-workspace experience (navigation, conversation, composer). Keep using Codeline-owned sessions, runs, tools, and APIs; do not add external OpenCode/Pi/T3 session adapters.

## Decisions

- Both views are available in the new sidebar: a flat draggable session list and collapsible project groups. Default to the flat list (T3 Code's source default); persist the selected mode locally. The effective setting in the user's paired T3 browser could not be read.
- Drag reorder must survive reloads. Store a validated, account-scoped ordering of stable session IDs locally; append sessions not yet ordered in existing API order. Handle paginated additions without dropping saved IDs. Do not change server chronology or the legacy list.
- Preserve `/sessions-legacy`, `/sessions-legacy/new`, and `/sessions-legacy/:sessionId` as the old experience. New routes `/sessions`, `/sessions/new`, `/sessions/:sessionId` use the new layout. Navigation within each family stays there. Existing non-session links may lead to the new default view.
- Reuse existing session list, project identity, chat/composer, creation, actions, SSE, and generic `#ui` components. Keep copied `./ui` read-only. Adapt layout and styling from local `~/adaptive/t3code` without importing its runtime or adapters.
- Use only repository-managed preview services. Focused tests serially; defer browser verification until the integrated page exists and avoid full e2e runs during increments.

## Tasks

1. **Route split:** Add route names/maps and family-aware URL/navigation so current workspace survives at the legacy path and new paths select a distinct workspace layout. Add focused route/navigation tests.
2. **New sidebar model:** Implement persisted flat/grouped mode, stable account-scoped manual ordering, project-group derivation, and precise pure tests. Integrate with existing pagination and session mutation state without affecting legacy tabs.
3. **New workspace presentation:** Build T3-inspired desktop/mobile shell, sidebar with mode switch, draggable flat rows and collapsible project groups, and selected chat/creation area by composing Codeline state/components. Preserve existing session actions and accessibility.
4. **Integration and verification:** Finish wiring, styling, focused tests/typecheck, then test new and legacy routes in the combined managed preview using a browser subagent. Fix any issues found.

## Status

- Task 1: complete (legacy route family preserves in-family navigation; both families currently render old layout)
- Task 2: complete (new sidebar model integrated)
- Task 3: complete
- Task 4: complete (focused tests, typecheck, managed preview and browser checks)

## Current context

`/sessions-legacy` retains the original `WorkspacePage`; `/sessions` has a separate `SessionsWorkspacePage` and `SessionSidebarNew`, sharing existing session/composer state. Flat/grouped mode, collapsible groups, drag and keyboard reorder, local account-scoped order, and pagination are integrated. Browser verification confirmed distinct routes, mode persistence, and no page overflow at 320px/390px. Current test account has no conversations, so live drag with real session rows was not exercised; synthetic ordering and grouping tests cover the behavior. The paired T3 browser preference remains unavailable, so default is flat.
