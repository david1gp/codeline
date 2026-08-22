# Codeline Agent Instructions

Run tests with a maximum concurrency of 1.
After a failure, run only the failing file/test name.

## Development Services

- Use only the repository-managed systemd user services defined under `ops/dev/` for Codeline development dependencies and application services.
- Do not start ad-hoc processes, replacement servers, or unrelated services to work around the managed services. In particular, do not launch a second PostgreSQL, Zero cache, API, or development server outside the managed service workflow.
- If a managed service fails, diagnose and repair that service. Check its systemd user status and journal, inspect the relevant `ops/dev/` scripts and configuration, fix the root cause, and restart the managed service. Do not bypass it with a substitute service.

## Example Data and Zero

- Seed example data deterministically through a repository-owned script or command using checked-in fixture data. Do not use one-off SQL, manual inserts, or undocumented local data generation as a substitute.
- Use `~/opensource/zero/apps/zbugs` as the working reference implementation for this seeding workflow, especially its `scripts/seed.ts`, `db-seed` command, and documented migration/seed sequence.
- Consult `~/opensource/zero/apps/zbugs` before changing Zero sync application configuration. Its `src/zero-init.tsx`, `shared/schema.ts`, `.env.example`, and `drizzle.config.ts` are the working examples for Zero client/cache URLs, query and mutation endpoints, schema wiring, and the PostgreSQL upstream connection.
- Local Zero topology is fixed: the browser origin is `PUBLIC_ORIGIN` (`https://preview.codeline.work`). `VITE_ZERO_CACHE_URL`, `VITE_ZERO_QUERY_URL`, `VITE_ZERO_MUTATE_URL`, `ZERO_QUERY_URL`, and `ZERO_MUTATE_URL` must be that origin and its `/api/query` and `/api/mutate` paths. Do not point those URLs at `127.0.0.1` or `:6000`/`:6001` while the UI is reached through the preview origin. The cache allowlist matches the browser URL exactly; compose maps `preview.codeline.work` to the host gateway.
- After changing `.env` Zero URLs, restart the managed `codeline-dev-zero-cache` unit. Do not start a host `zero-cache-dev` or a second cache.
- When Zero stays offline or conversations keep loading, check in order: browser WebSocket is `wss://preview.codeline.work/sync/...`; cache logs for `not allowed by ZERO_QUERY_URL`; replica/schema drift; cookie forwarding to the preview query URL.
- Inspect Solid Router internals in `/home/david/opensource/solid-router` when needed.

## solid-ui

- The library code is copied into this repo at `./ui`.
- Treat `./ui` as a read-only copy. App-specific UI stays under `src/ui`.
- Import library components via `#ui/...`.
- Before implementing new UI, inspect and reuse available generic components in `./ui`.

## Local Source Lookup

Consult these local checkouts instead of fetching GitHub files one by one:

- `~/opensource/pi-web`
- `../result`
- `../utils`
- `~/opensource/zero`
- `~/opensource/tanstack-ai`
- `~/opensource/markdown`
