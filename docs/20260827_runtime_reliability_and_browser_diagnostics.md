# Runtime reliability and browser diagnostics

## Goal

Fix resource loading and persistent update prompts, add reproducible Luna low-effort chat coverage, and make browser failures visible in Playwright output and the managed server journal.

## Decisions

- Treat disabled or keyless resource queries as idle, not loading.
- Activate a waiting service worker before reloading and reload once on controller change.
- Use the enabled `codex-lb/gpt-5.6-luna` model with `low` reasoning effort in the real chat E2E.
- Capture Playwright console, page errors, and failed requests with actionable test failures.
- Add an authenticated same-origin batched client-log endpoint with strict validation, bounded payloads, sanitization, recursion prevention, and structured journal output.
- Keep raw client logs out of SQLite and never forward credentials, bodies, query strings, or fragments.

## Approach

- Fix each state/lifecycle defect with focused unit coverage.
- Add server ingestion before installing browser hooks.
- Add deterministic browser diagnostics and Luna chat tests through the combined managed preview service.
- Run focused tests serially, then the relevant combined E2E coverage.

## Tasks

- [x] 1. Fix resource-selector idle/loading semantics and add focused state tests.
- [x] 2. Fix service-worker update activation/reload lifecycle and add focused tests.
- [x] 3. Add validated, bounded, sanitized authenticated client-log ingestion with API tests.
- [x] 4. Add browser error/console/network capture and forwarding without recursive reporting.
- [x] 5. Add deterministic Playwright diagnostics helpers and E2E coverage for server ingestion.
- [x] 6. Add a real Luna low-effort chat E2E that verifies selection, payload, and finalized messages.
- [x] 7. Run combined managed-preview regression verification.

## Paths

- `src/ui/sessionResourceSelectorStateCreate.ts`
- `src/ui/httpQueryStateCreate.ts`
- `src/ui/pwa/`
- `src/ui/main.tsx`
- `src/api/client/apiHttpClientCreate.ts`
- `src/api/diagnostics/`
- `src/api/apiRoutesAdd.ts`
- `src/app/appCreate.ts`
- `test/`
- `e2e/`
