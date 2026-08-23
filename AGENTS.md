# Codeline Agent Instructions

Run tests with a maximum concurrency of 1.
After a failure, run only the failing file/test name.

## Development Services

- Use only the repository-managed systemd user services defined under `ops/dev/` for Codeline development dependencies and application services.
- Do not start ad-hoc processes, replacement servers, or unrelated services to work around the managed services. In particular, do not launch a second API or development server outside the managed service workflow.
- If a managed service fails, diagnose and repair that service. Check its systemd user status and journal, inspect the relevant `ops/dev/` scripts and configuration, fix the root cause, and restart the managed service. Do not bypass it with a substitute service.

## Example Data and SQLite

- Seed example data deterministically through a repository-owned script or command using checked-in fixture data. Do not use one-off SQL, manual inserts, or undocumented local data generation as a substitute.
- The managed API owns the embedded SQLite file at `data/db.sqlite`; use the repository-owned `db:reset-seed` workflow for resets and deterministic fixture data.
- The browser reaches the managed UI at `PUBLIC_ORIGIN` (`https://preview.codeline.work`). Typed HTTP and `/api/events` SSE are same-origin routes proxied by the UI service to the API.
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
