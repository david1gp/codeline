# Zero session pagination and diagnostics

## Goal

Bound the sessions sidebar to pages of a configurable size, load older sessions on demand, and retain enough Zero hydration diagnostics to investigate future slow-materialization warnings.

## Decisions

- Use 25 sessions as the default page size.
- Configure the page size with `SESSIONS_SIDEBAR_PAGE_SIZE`; Vite exposes that same server setting to the client as a public build value.
- Preserve the existing `updatedAt DESC, id DESC` ordering.
- Add a sidebar “Load more” action rather than loading every active session initially.
- Expand one live ordered query limit by one page per action so previously loaded sessions remain reactive.
- Use Zero-supported diagnostics and query APIs rather than application-specific database probes.
- Keep hydration and query-plan diagnostics development-only through Zero's public Inspector APIs.
- Omit raw query literals and literal-bearing join plans from console diagnostics.
- Treat the page size as UI behavior rather than a server-side security boundary; authorization remains enforced by the authenticated `userId` filter.
- Treat the five-second client warning as a diagnostic that includes initial authoritative server/network synchronization, not proof of slow SQL.

## Approach

- Confirm repository configuration conventions, Zero ordered-query pagination behavior, and available diagnostic APIs.
- Add the page-size setting through the existing configuration system.
- Materialize the first page, expand one live ordered query by one page on demand, and retain existing selection/grouping behavior.
- Read hydration metrics from `z.inspector.client.queries()` and obtain row-read counts and plans through the Inspector analysis APIs.
- Cover query boundaries and sidebar behavior with automated tests and browser verification.

## Tasks

- [x] 1. Confirm configuration, pagination, sidebar, and diagnostic integration points.
- [x] 2. Add the configurable session page size with a default of 25.
- [x] 3. Implement live expanding active-session loading and the sidebar “Load more” action.
- [x] 4. Add supported Zero hydration diagnostics for future incidents.
- [x] 5. Add or update automated tests.
- [ ] 6. Verify the sidebar and diagnostics in the browser.
- [x] 7. Update the issue document with the implemented handling.

## Paths

- `docs/20260818_zero-session-pagination-diagnostics.md`
- `docs/20260818_zero-slow-query-materialization.md`
- `src/ui/codelineQueries.ts`
- `src/ui/sessionListStateCreate.ts`
- `src/ui/SessionList.tsx`
- `src/ui/CodelineZeroProvider.tsx`
- `src/ui/zeroMaterializationDiagnosticsStart.ts`
- `src/ui/demo/demoSessionListStateCreate.ts`
- `src/ui/`
- `src/configuration/runtimeConfigurationSchema.ts`
- `src/configuration/runtimeConfigurationParse.ts`
- `src/server/serverStart.ts`
- `.env.example`
- `src/ui/vite-env.d.ts`
- `test/runtimeConfigurationParse.test.ts`
- `test/codelineQueries.test.ts`
- `test/sessionListStateCreate.test.ts`
- `test/sessionList.test.ts`
- `test/zeroMaterializationDiagnosticsStart.test.ts`
- `test/`
