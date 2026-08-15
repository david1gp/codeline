# Navigation and settings

## Goal

- Make every navigation item icon visible and every icon popover usable.
- Prefer standard `#ui` components over app-specific button/popover styling.
- Move PWA installation from the header into a dedicated Settings route and navigation tab.

## Decisions

- Keep route-backed Solid Router links for navigation so active-route behavior remains intact.
- Add leading standard `Icon` components to all navigation links.
- Reuse the single existing PWA state; do not create route-local install state.
- Keep `./ui` read-only and place app-specific composition under `src/ui`.

## Approach

- Add a Settings page and `/settings` route.
- Move the existing PWA actions into Settings and render them with standard controls.
- Replace custom icon buttons/popover triggers in the affected shell with standard `#ui` components where compatible.
- Verify routes, types, tests, build, and the running UI.
- Current context: implementation, focused/full tests, typecheck, build, formatting, task-scoped lint, and desktop/mobile browser verification are complete.

## Tasks

- [x] 1. Implement Settings route/navigation, move PWA installation, and standardize affected navigation/actions.
- [x] 2. Add or update focused tests for the Settings route and navigation/PWA placement.
- [x] 3. Run repository verification and visually verify navigation icons, popovers, and Settings/PWA behavior.

## Paths

- `src/ui/App.tsx`
- `src/ui/UiRouter.tsx`
- `src/ui/SettingsRoutePage.tsx`
- `src/ui/settingsRoutePageStateCreate.ts`
- `src/ui/pwa/PwaStatusActions.tsx`
- `src/ui/pwa/pwaStatusContext.ts`
- `src/ui/ThemeSwitcher.tsx`
- `src/ui/ConnectionStatusIndicator.tsx`
- `src/identity/ui/AccountPopover.tsx`
- `test/appRouteResolve.test.ts`
