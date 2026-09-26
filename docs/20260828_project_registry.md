# User-scoped project registry

## Goal

Persist each user's Codeline projects independently of sessions, import David's opened OpenCode project paths without session data, and use the registry throughout the UI, including New Session project selection.

## Decisions

- A registered project belongs to one Codeline user and stores its canonical absolute filesystem path, optional display name, and timestamps.
- Every registered project receives a UUIDv7 ID generated when it is first persisted; OpenCode IDs are not copied.
- Existing session project paths remain immutable historical snapshots and are backfilled into the owning user's registry when canonical.
- Removing a registered project does not remove sessions, notes, or files.
- Registration and use retain configured-root containment, real-directory, canonical-path, and symlink protections.
- OpenCode import reads only project path metadata from the server-configured David OpenCode database and never reads or copies sessions or messages.
- The registry is the user-scoped source for project selectors; filesystem discovery remains registration assistance.
- Registered but unavailable projects remain visible and cannot be selected for new work.

## Approach

- Add a migrated user/project persistence model and isolated repositories.
- Add authenticated registry list, register, rename, remove, resolve, and OpenCode-import operations.
- Change new-session transport to select an authorized registry project ID while preserving the canonical path in the session row.
- Share registry state across project, session, sidebar, Files, and Notes UI.
- Import David's current OpenCode project paths idempotently and verify session data is unchanged.

## Tasks

- [x] 1. Add the registry table, migration, canonical session-path backfill, and persistence tests.
- [x] 2. Add user-isolated registry repositories and project identity helpers with tests.
- [x] 3. Add authenticated registry APIs and registry-backed project authorization with tests.
- [x] 4. Add metadata-only OpenCode import and fixture-based tests.
- [x] 5. Create sessions by registered project ID and retain project-path snapshots.
- [x] 6. Add shared registry UI state and make project registration and New Session use it.
- [x] 7. Update the sidebar to show empty registered projects and support rename/removal.
- [x] 8. Update Files and Notes project selectors to use the registry.
- [ ] 9. Expose the OpenCode import control, import David's paths, and verify the complete flow.
- [x] 10. Replace deterministic project identifiers with persisted UUIDv7 IDs and update migrations, repositories, APIs, and tests.

## Paths

- `src/project/`
- `src/session/`
- `src/note/`
- `src/ui/`
- `src/database/`
- `test/`
- `e2e/`
- `drizzle.config.ts`
- `.env.example`
