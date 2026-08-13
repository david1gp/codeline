# Notes feature

## Goal

Add persisted, Zero-synced notes with responsive grouped card listing, separate create and detail/edit pages, project assignment, and confirmed deletion.

## Decisions

- Routes: `/notes`, `/notes/new`, and `/notes/:noteId`.
- The first note line is the card heading; listing previews the remaining content in at most two lines.
- Notes assigned to a project are grouped by project; unassigned notes have their own group.
- Listing uses one to four responsive columns.
- Card selection opens the detail/edit page.
- Destructive deletion requires confirmation and states the note line count.
- Actions use icon buttons with accessible text titles.
- Project assignment is stored as nullable filesystem `project_path`.
- Notes are user-owned and ordered by most recently updated, then ID.
- Notes persist creation and update timestamps.
- Future agent-prompt dispatch is out of scope, but note/project data should support it without redesign.
- Project assignment options come from the existing `/api/project/directory` root listing (top-level directories), not a new endpoint.
- The detail page saves explicitly; the save action is disabled until content or project assignment differs from the synced note.
- Development-facing Zero query and mutation endpoints use the `preview.codeline.work` origin; production uses `app.codeline.work` through `.env.production`.
- Notes are declared in `UiRouter` with Solid Router, use router links and route parameters, and use router navigation after create/delete.

## Approach

- Follow existing repository patterns for schema, Zero queries/mutations, projects, routing, pages, navigation, dialogs, and tests.
- Keep changes isolated to notes-specific modules plus the smallest shared schema/router/navigation integrations.
- Verify data behavior and responsive UI with automated checks and browser end-to-end coverage.

## Tasks

1. [completed] Inspect architecture, concurrent working-tree changes, and reusable project/Zero/UI/test patterns.
2. [completed] Add the persisted notes data model and Zero query/mutation support.
3. [completed] Add notes routes, navigation access, responsive grouped listing, and new-note page.
4. [completed] Add note detail editing, project assignment, and line-count delete confirmation.
5. [completed] Correct environment-specific Zero endpoint configuration for preview development and production.
6. [completed] Add or update automated tests and run end-to-end browser verification for all note paths.
7. [completed] Replace remaining full-page create/delete redirects with idiomatic Solid Router navigation and verify all note routes.
8. [in progress] Format, isolate this feature's changes from concurrent work, create semantic commits, and push them.

## Paths

- `docs/20260813_notes-feature.md`
- `src/database/databaseSchema.ts`
- `src/database/zeroSchema.ts`
- `src/database/migrations/`
- `src/ui/codelineQueries.ts`
- Notes-specific data modules and tests following repository conventions.
- `src/note/ui/`
- `src/ui/App.tsx`
- `src/ui/appRouteResolve.ts`
- `.env.production`
- `.env.example`
- `ops/dev/`
- `src/ui/UiRouter.tsx`
- `src/note/ui/newNotePageStateCreate.ts`
- `src/note/ui/notePageStateCreate.ts`
