# Session URL structure

## Goal

Make the active conversation the primary sessions URL resource while preserving the selected sidebar tab.

## Decisions

- Canonical selected-session URL: `/sessions/:sessionId?tab=:sidebarTab`.
- Canonical new-session URL: `/sessions/new?tab=:sidebarTab`; `new` is a reserved static route.
- Canonical no-selection URL: `/sessions?tab=:sidebarTab`.
- Valid tabs remain `recent`, `watched`, `projects`, and `search`.
- Existing `/sessions/:sidebarTab?session=:sessionId` links redirect to the canonical structure.
- Local tab persistence remains the fallback when `tab` is absent.

## Approach

- Separate session identity from sidebar tab parsing and destination generation.
- Normalize legacy and incomplete session URLs at the workspace route boundary.
- Keep session creation and selection behavior unchanged apart from canonical navigation.
- Update route shell recognition and focused route/state tests.
- Verify the resulting navigation in the browser.

## Tasks

- [ ] 1. Implement canonical route parsing, generation, normalization, and shell recognition.
- [ ] 2. Update session selection and creation navigation to use canonical URLs.
- [ ] 3. Update and add route/state tests, then run static and unit verification.
- [ ] 4. Browser-verify selected-session, tab-preservation, legacy redirect, and new-session flows.

## Paths

- `src/app/appKnownRouteResolve.ts`
- `src/ui/UiRouter.tsx`
- `src/ui/WorkspaceRoutePage.tsx`
- `src/ui/workspaceRoutePageStateCreate.ts`
- `src/ui/workspaceScreenStateCreate.ts`
- `src/ui/sessionNavigationStateCreate.ts`
- `src/ui/sessionSidebarRouteStateCreate.ts`
- `src/ui/sessionSidebarDestinationResolve.ts`
- `src/ui/sessionSidebarRouteHrefResolve.ts`
- `src/ui/sessionListStateCreate.ts`
- `src/ui/SessionList.tsx`
- `src/ui/sessionTargetSelectorStateCreate.ts`
- `src/ui/selectedSessionStateCreate.ts`
- `src/ui/sessionInitialMessageStateCreate.ts`
- `test/sessionNavigationStateCreate.test.ts`
- `test/sessionSidebarRouteStateCreate.test.ts`
- `test/sessionSidebarDestinationResolve.test.ts`
- `test/appUiShellFallback.test.ts`
