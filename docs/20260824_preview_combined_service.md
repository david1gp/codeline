# Combined preview service

## Goal

Replace the split managed preview API/Vite stack with one no-watch Bun service that serves the API, SSE, and the built UI from `dist`, with one build-and-restart deployment command.

## Decisions

- Keep Vite only as the UI build tool; remove the managed Vite preview runtime.
- Add `bun run start` for the compiled server and `bun run deploy` for build plus managed-service restart and readiness verification.
- Route `preview.codeline.work` directly to port `6001`.
- Keep all development/application services repository-managed under `ops/dev`.
- Document in `AGENTS.md` that the combined managed preview service is the required post-change test target.

## Approach

- Reconfigure the managed API unit and target as the single preview runtime.
- Remove the managed UI unit and its lifecycle handling.
- Update deployment and validation scripts around the compiled `dist/server` and `dist/ui` output.
- Verify build, deployment, static UI, API, SSE, service lifecycle, and browser behavior through the public origin.

## Tasks

- [x] 1. Add no-watch start and deploy scripts for the compiled combined server.
- [x] 2. Convert the managed preview target and Caddy route to the API-only combined service and remove the managed Vite UI runtime.
- [x] 3. Add the required `AGENTS.md` instruction and update directly affected operational tests/documentation.
- [x] 4. Validate static UI, SPA fallback, assets, API, SSE, clean restart/shutdown, and browser behavior through `https://preview.codeline.work`.

## Paths

- `package.json`
- `ops/deploy.sh`
- `ops/dev/`
- `AGENTS.md`
- `src/app/`
- `src/server/`
- `test/`
- `e2e/`
