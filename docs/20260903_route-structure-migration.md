# Route structure migration

## Goal

Migrate Codeline's Solid Router route definitions to the `urlXyz`, `getRoutesXyz`, `pageNameXyz`, and `pageRouteXyz` structure used by the reference app, including lazy-loaded route pages.

## Decisions

- Keep `@solidjs/router` and the existing `ApplicationRoot` nesting.
- Treat each `*_url` module as the route group's source of truth for names, patterns, URL builders, and lazy route definitions.
- Preserve existing URLs, wildcard behavior, route ordering, and navigation behavior.
- Reuse repository libraries and existing route types; do not change the router library.

## Approach

- Normalize every route group contract and repair the settings group.
- Standardize `getRoutesXyz` around `pageNameXyz`/`pageRouteXyz` mappings with `solid-js/lazy` page imports.
- Compose those route groups in `UiRouter` without eager page imports.
- Replace remaining hardcoded application navigation and route comparisons with the route builders/patterns.
- Update focused tests and verify the repository's typecheck, formatting, and test commands.

## Tasks

1. [x] Normalize route-group contracts and settings naming.
2. [x] Standardize lazy `getRoutesXyz` implementations and route adapters/types.
3. [x] Compose all route groups in `UiRouter` while preserving nesting and behavior.
4. Migrate application navigation and route-resolution consumers to the route modules:
   - 4a. [x] Migrate core app, shell, session, navigation, and route-resolution consumers.
   - 4b. [x] Migrate note, demo, simulation, and other feature-specific consumers.
5. [x] Update/add route-focused tests and run the required verification commands.

## Current context

Route contract normalization is complete. Workspace now exports `PageRouteWorkspace`, uses the shared `as const satisfies` route contract, and exposes standalone URL builders while preserving its existing API. Settings uses `urlSettings` and `pageRouteSettings`.

All eight route groups now use typed `RouteConfig` mappings derived from their page names/routes, with lazy page loading and preserved wildcard/order behavior.

`UiRouter` now composes all eight lazy route groups and no longer eagerly imports route pages; the existing shell nesting and top-level auth/demo routes remain intact.

Core route/navigation/session consumers use canonical route constants/builders, including app route resolution and OIDC callback validation.

Note, demo, and simulation consumers now use the route builders/patterns without changing their existing URL or fallback behavior.

Route assertions cover migrated composition, route ordering/counts, patterns, encoding, wildcard behavior, and runtime lazy imports for all route groups. Full tests and preview smoke checks pass.

Migration is complete. Final typecheck, formatting, build, full test suite, managed preview readiness, and browser smoke checks pass; the simulation smoke route requires unavailable seeded session data.
