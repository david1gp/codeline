# Demo navigation link

## Goal

Add a right-aligned `D` navigation link button that routes to `/demo`.

## Decisions

- Reuse the existing navigation/button components and styling.
- Keep the link label exactly `D` and place it on the right side of the navigation.

## Approach

1. Locate the existing navigation component and its tests or route conventions.
2. Add the `/demo` link without changing unrelated navigation behavior.
3. Verify with the repository-managed preview service and focused checks.

## Tasks

- [x] Locate the navigation component: `src/ui/App.tsx`.
- [x] Add the right-side `D` link to `/demo`.
- [x] Verify the change with typecheck, diff validation, and the managed preview endpoint.
