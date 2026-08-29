# Sessions New Route and Project Selection

## Goal

Make `/sessions/new` the canonical entry point for starting a session and ensure its project selector reflects the available registered projects shown by the application.

## Decisions

- The New Session action navigates directly to `/sessions/new`.
- New-session project options come from the shared project registry's available projects.
- Historical or unavailable projects may remain visible in existing-session navigation but are not selectable for a new session.

## Approach

- Reuse the existing `/sessions/new` workspace route and move entry navigation to it.
- Connect new-session resource controls to the shared loaded project registry and preserve loading versus truly empty states.
- Cover route navigation and project option behavior with focused tests, then verify through the managed combined preview service.

## Tasks

- [x] 1. Make the New Session action navigate directly to `/sessions/new`.
- [x] 2. Fix new-session project options and empty-state behavior using the shared registry.
- [x] 3. Run focused checks and browser verification on the managed preview service.
- [ ] 4. Review, commit, and deploy the completed changes.

## Paths

- `src/ui/`
- `src/project/ui/`
- `docs/20260829_sessions-new-project-selection.md`
