# Session routes and root dashboard

## Goal

Move the session workspace to `/sessions`, give each sidebar tab its own route, remember the most recently chosen session tab across navigation and reloads, add a root dashboard at `/`, and make the mobile Sessions top-navigation action open the full-width session sidebar dialog.

## Decisions

- Valid session sidebar routes are `/sessions/recent`, `/sessions/pinned`, `/sessions/projects`, and `/sessions/search`.
- `/sessions` resolves to the last persisted valid sidebar tab, defaulting to `recent`.
- The selected sidebar tab is represented by the URL and mirrored to local storage so the Sessions top-nav destination survives visiting other sections and browser reloads.
- Session selection remains a `?session=` query parameter on the active sidebar-tab route; search remains a query parameter on `/sessions/search`.
- The top-navigation label changes from Workspace to Sessions and targets the remembered session-tab route.
- `/` is a standalone authenticated dashboard with cards linking to Sessions, Explorer, Notes, and Settings; it is not a session workspace route.
- On mobile, activating the Sessions top-navigation item opens the existing session sidebar as an accessible full-width dialog. Selecting a session closes the dialog and leaves the session view underneath.
- Native project-group expanded/collapsed state remains reload-transient; only the requested most-recent sidebar tab is newly persisted.

## Chat API compaction contract

The authenticated chat transport is `POST /api/sessions/:sessionId/chat`. Its request includes
`messages`, `runId`, and `threadId` (which must equal `:sessionId`), and the final message must be
a non-empty plain-text user message. The response is the normal command response
`{ "runId": "...", "sessionId": "..." }`.

Manual compaction is not a separate endpoint or command with arguments. It is selected only when
the final user content, after trimming whitespace, is exactly `/compact`; `/compact now` and other
similar names do not select it. The control prompt is neither persisted as a user message nor
forwarded to a provider.

Before a provider request, automatic compaction pressure uses the configured `pressureThreshold`
against the input budget left after `reserveOutputTokens`. Reported provider usage is preferred;
when it is unavailable or unusable, Codeline uses a safe serialized estimate (including any
estimable trailing input) and otherwise leaves the context unchanged. A `provider_context_overflow`
from the outer request can trigger a separately bounded retry using `maxOverflowRetries`; this
does not consume generic retry admission. Delegated tool loops have their own in-memory overflow
retry bound (one by default), retry only before non-error content is emitted, and do not
re-execute tools.

Compaction is non-destructive. Durable user/assistant transcript rows and the compaction lifecycle
remain available; model context is projected as the latest successful `compaction-summary` system
message followed by the durable tail after its covered sequence. Delegated provider tool-call and
tool-result handling remains lifecycle-safe in memory, where complete call/result boundaries are
required before compaction.

## Approach

- Introduce a validated persisted session-tab route state shared by navigation, route composition, and the sidebar tabs.
- Move the workspace route to `/sessions` and `/sessions/:sidebarTab`, preserving query-based session/search navigation and authentication redirects.
- Add a small root dashboard page using the same top-level destinations and icons as primary navigation.
- Connect the application navigation to the existing tested mobile drawer controller and change the mobile panel to span the viewport width.
- Cover route normalization, storage restoration, tab navigation, dashboard destinations, and mobile drawer state with focused tests and browser verification.

## Tasks

- [x] 1. Add validated persisted session-tab route state and migrate session/sidebar navigation to `/sessions/:sidebarTab`.
- [x] 2. Rename Workspace to Sessions, make top navigation target the remembered tab, and add the `/` dashboard cards.
- [x] 3. Connect mobile Sessions navigation to the existing drawer controller and make the dialog full width.
- [x] 4. Run focused/full verification and browser-test direct routes, reload persistence, top-navigation restoration, dashboard cards, desktop navigation, and mobile dialog behavior.

## Paths

- `src/app/appKnownRouteResolve.ts`
- `src/ui/UiRouter.tsx`
- `src/ui/App.tsx`
- `src/ui/WorkspaceRoutePage.tsx`
- `src/ui/WorkspacePage.tsx`
- `src/ui/workspacePageStateCreate.ts`
- `src/ui/workspaceScreenStateCreate.ts`
- `src/ui/sessionListStateCreate.ts`
- `src/ui/sessionNavigationStateCreate.ts`
- `src/ui/SessionList.tsx`
- `src/ui/appRouteResolve.ts`
- `src/ui/`
- `test/`
