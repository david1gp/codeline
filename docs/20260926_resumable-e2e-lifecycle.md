# Resumable E2E lifecycle

## Goal

`test:e2e` runs every Playwright E2E suite sequentially against `https://preview.codeline.work` (the requested production origin); `test:e2e:dev` explicitly selects the managed development environment. Runs resume automatically from a validated, target-bound checkpoint and safely remove owned data on success or after 24 hours. Cleanup is attempted after every invocation, including failures. Verify a full fresh suite and deliberate failure/resume.

## Existing constraints and decisions

- There are 19 spec files/28 tests; Playwright already uses one worker. Tests currently issue/purge synthetic identities through guarded local SQLite scripts; production fixture APIs do not yet exist. Do not loosen the local fixture guard or launch an unmanaged service.
- Preview is the public origin of the repository-managed combined server; its built service currently serves this checkout. Use the managed service for verification and preserve one-worker tests.
- Production fixture lifecycle must use authenticated, narrowly scoped application APIs, not direct test-runner database writes. Reuse existing identity/purge logic server-side and existing dependencies (Valibot). Never delete records lacking verified E2E ownership.
- Checkpoint storage is `/tmp/opencode/codeline/e2e/`, versioned and Valibot-validated, with target, origin, identity, created time, completed suites, and resource IDs. A stale (>24h) run is purged before beginning a fresh run; target mismatch never resumes.
- Successful run data is removed and its checkpoint cleared; failed run data/checkpoint remain available until expiry. Cleanup of other expired runs executes in `finally`, reports errors, and verifies absence across every integration the suites actually create. No Stripe/mail/storage resources are presently created by these suites; don't introduce unrelated integrations.

## Implementation tasks

1. Inventory exact E2E fixture ownership and lifecycle, external resources, required target-specific configuration, and reconcile local-only issue/purge with API lifecycle. Document concrete APIs and data boundaries.
2. Implement narrowly authorized run-owned fixture issue/status/expiry/cleanup APIs with explicit creation time and ownership markers and idempotent verified cleanup. Cover all app/database/external resources actually created, including test-specific diagnostics/seed/project state; avoid shared data deletion. Add focused tests.
3. Migrate E2E helpers/specs to API lifecycle, deterministic run identity, unmistakable E2E names/IDs and resource registration. Make failure paths retain run-owned data for resume, successful paths clean immediately; preserve isolation of seeded/shared records. Add focused tests.
4. Implement a serial suite runner and scripts: explicit production default and dev mode, atomic Valibot checkpoint, same-target resume, completed-suite skipping, 24h rollover, failure-preserving cleanup in `finally`, and success teardown. Add focused runner tests.
5. Verify via managed combined preview: targeted checks, full fresh `test:e2e` (one worker), deliberate failure/resume and target mismatch/aged cleanup checks. Repair only failures attributable to this change, rerun only failing files after failures, then complete required suite verification.
6. Organize each E2E workflow into its own folder and each workflow step into a separate subject-first file, following the code-style skill. Keep shared runner/fixture infrastructure separate from individual workflow steps; maintain deterministic discovery and validated checkpoint behavior.

## Current context

Tasks 1–6 are complete. The manifest discovers all 20 Playwright workflows (29 spec files, 30 tests); separate `scripts/e2e*` files are fixture utilities, not omitted suites. The runner uses production by default, with a separate dev target identity, an atomic Valibot checkpoint, and serial Playwright steps. Server-side fixture ownership covers issued members and their dependent records, diagnostic rows, sample sessions/projects and command-project paths; unrelated shared seed is preserved. The dedicated fixture API uses `E2E_FIXTURE_API_TOKEN` and refuses unverified ownership. Filesystem teardown verifies owned paths absent before deleting markers; checkpoint resume requires exact target identity and expires at 24 hours. No Stripe, mail or external storage objects are created by these suites. OpenCode import and configured-root reconciliation exclude fixture command paths; teardown verifies cross-run fixture registrations and refuses ordinary-user data. A clean full production `bun run test:e2e` passed with one worker and removed its checkpoint and owned fixtures. The isolated managed-preview lifecycle verification passed deliberate failure/resume, target mismatch, and 24-hour rollover checks. Preserve the managed database; do not reset or reseed it.
