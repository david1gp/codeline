# Codeline Agent Instructions

## Development Services

- Use only the repository-managed systemd user services defined under `ops/dev/` for Codeline development dependencies and application services.
- Do not start ad-hoc processes, replacement servers, or unrelated services to work around the managed services. In particular, do not launch a second PostgreSQL, Zero cache, API, or development server outside the managed service workflow.
- If a managed service fails, diagnose and repair that service. Check its systemd user status and journal, inspect the relevant `ops/dev/` scripts and configuration, fix the root cause, and restart the managed service. Do not bypass it with a substitute service.
- Development-only repair may drop the local PostgreSQL database or data and reset Podman containers and their volumes when that is useful to restore a consistent state. Confirm that the target is local development data before doing so.

## Example Data and Zero

- Seed example data deterministically through a repository-owned script or command using checked-in fixture data. Do not use one-off SQL, manual inserts, or undocumented local data generation as a substitute.
- Use `~/opensource/zero/apps/zbugs` as the working reference implementation for this seeding workflow, especially its `scripts/seed.ts`, `db-seed` command, and documented migration/seed sequence.
- Consult `~/opensource/zero/apps/zbugs` before changing Zero sync application configuration. Its `src/zero-init.tsx`, `shared/schema.ts`, `.env.example`, and `drizzle.config.ts` are the working examples for Zero client/cache URLs, query and mutation endpoints, schema wiring, and the PostgreSQL upstream connection.
- Inspect Solid Router internals in `/home/david/opensource/solid-router` when needed.

## solid-ui

- The library code is copied into this repo at `./ui`.
- Treat `./ui` as a read-only copy. App-specific UI stays under `src/ui`.
- Import library components via `#ui/...`.
- Look up existing generic UI components in `./ui` before re-implementing them.

## Local Source Lookup

Consult these local checkouts instead of fetching GitHub files one by one:

- `~/opensource/pi-web`
- `../result`
- `../utils`
- `~/opensource/zero`
- `~/opensource/tanstack-ai`
- `~/opensource/markdown`
