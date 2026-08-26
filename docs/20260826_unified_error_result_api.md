# Unified error/result API

## Goal

Adopt a consistent coded `Result` and HTTP error interface, with domain-owned error codes combined by a central catalog, and update tests for the resulting behavior.

## Decisions

- Each domain exports its own stable, namespaced error definitions.
- The API layer imports and combines domain definitions into one catalog.
- The central catalog owns HTTP status and retryability lookup without owning domain code declarations.
- Result metadata (`code`, details, operation, status) is preserved across repository, action, API, client, and UI boundaries.
- API routes classify failures by code, never by error-message substrings.
- Existing generic API/transport codes remain centralized where they are not domain-specific.
- UI requests use the shared API HTTP client and typed error response contract.

## Approach

- Add the smallest shared catalog and result-to-HTTP conversion primitives compatible with `@adaptive-ds/result` and the existing API error schema.
- Introduce domain-owned definitions first for currently classified run, message, and session failures.
- Migrate route and propagation boundaries incrementally, then standardize the remaining direct UI request.
- Add focused unit/integration coverage and verify through the repository-managed combined preview service.

## Tasks

- [x] 1. Define shared catalog composition and HTTP response mapping primitives with focused tests.
- [ ] 2. Add run-owned error definitions and migrate run result propagation/routes/tests from message matching to codes.
- [ ] 3. Add message-owned error definitions and migrate message result propagation/routes/tests from message matching to codes.
- [ ] 4. Add session-owned error definitions, preserve coded result metadata, and route session rename through the shared HTTP client with tests.
- [ ] 5. Audit remaining touched-domain result propagation for metadata loss and update focused tests.
- [ ] 6. Run scoped test suites and validate the integrated behavior through the managed combined preview service.

## Paths

- `src/api/errors/`
- `src/api/client/`
- `src/run/`
- `src/message/`
- `src/session/`
- `src/**/*.test.ts`
- `src/**/*.test.tsx`
- `ops/dev/`
