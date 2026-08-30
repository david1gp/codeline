# Project Root Folders

## Goal

Make the Projects sidebar represent `~/leo`, `~/adaptive`, and `~/personal` as expandable folders whose immediate child directories are projects, with working project session creation and clear open-folder icons.

## Decisions

- Treat the three top-level directories as folder containers, not projects.
- Treat each immediate child directory as a project under its parent folder; do not recursively flatten deeper directories.
- Treat an immediate child symlink to an existing directory as a project only when its canonical target remains within the configured user's home boundary; keep arbitrary filesystem escapes rejected.
- Reconcile the hierarchy through a repository-owned deterministic workflow rather than manual database edits.
- Keep session creation attached to project rows so each child project creates a session with that project's ID and path.
- Show distinct closed and open folder icons based on disclosure state.
- Preserve unavailable-path handling and user disclosure preferences.

## Approach

- Align configured project roots with the actual `~/leo`, `~/adaptive`, and `~/personal` directories.
- Reconcile logical folder and project registry records from those configured roots using stable identities and deterministic ordering.
- Resolve the intentional `~/leo` symlink entries safely while retaining canonical identity, deduplication, and race checks.
- Keep the existing folder/project/session derivation and per-project creation flow, adapting only the data source and missing UI states.
- Add focused domain, state, and browser coverage for hierarchy, session creation, and folder icons.

## Tasks

- [x] 1. Define and implement deterministic root-to-folder/project registry reconciliation.
- [x] 2. Wire the managed development configuration and seed/reset workflow to the three actual roots.
- [x] 3. Add disclosure-aware open/closed folder icons and ensure every project row exposes working session creation.
- [x] 4. Add focused tests for hierarchy, identities, missing roots, disclosure icons, and project session targeting.
- [x] 5. Support safe immediate project symlinks used by `~/leo`, including live registry authorization and session creation.
- [x] 6. Reset/seed through the repository workflow, build, and verify the complete hierarchy and session creation in the managed preview.
