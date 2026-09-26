# Project folders

## Goal

- Let users create, view, rename, and delete project folders, assign projects to a parent folder, and render those folders as collapsible disclosures in `/sessions?tab=projects`.
- Initially categorize every existing registered project under `adaptive`, `leo`, or `personal` from its canonical path.
- Show green while a contained session is running and otherwise blue when a contained session has an ended run not yet viewed by the user on any device.
- Persist folder disclosure state.

## Decisions

- Persist user-owned project-folder entities with stable IDs and a nullable folder reference on each project.
- Bootstrap `adaptive`, `leo`, and `personal`; unmatched existing projects initially use `personal`.
- Deleting a folder preserves its projects as uncategorized.
- Use durable run lifecycle state rather than a ten-second inactivity heuristic.
- Persist per-user, per-session terminal-run acknowledgement for cross-device unseen state.
- Persist disclosure state per account and folder ID in local storage.
- Green takes visual precedence over blue while unseen state remains stored.
- Keep native nested disclosures.

## Approach

- Add project-folder entities, project assignment, session-view state, migration, backfill, and fixtures.
- Add folder CRUD/reassignment and registry aggregate status contracts.
- Add view acknowledgement and lifecycle synchronization to the existing event feed.
- Add folder UI and verify with tests and the managed preview.

## Tasks

- [x] 1. Add schema, migration, bootstrap/backfill, project assignment, session-view watermark, and fixtures.
- [x] 2. Add folder CRUD, project reassignment, registry aggregation/contracts/client state, and tests.
- [x] 3. Add session-view acknowledgement API, invalidation, client integration, and tests.
- [x] 4. Add exact active-run lifecycle synchronization and tests.
- [x] 5. Add nested project-folder disclosures, management UI, dots, persistent collapse state, and UI tests.
- [x] 6. Run focused/full checks and verify the managed combined preview in a browser.
- [x] 7. Review changes, create conventional commits, push, and deploy.

## Paths

- `src/project/`
- `src/session/`
- `src/run/`
- `src/stream/`
- `src/journal/`
- `src/database/`
- `src/ui/`
- `test/`
- `e2e/`
- `ops/dev/`
