# Sidebar tabs, projects, and watched sessions

## Goal

Redesign the workspace sidebar with full-width New Session and subtle New Project actions, icon tabs for recent, watched, projects, and search, two-line session rows, collapsible project groups, folder-path project selection, and persisted watched/project state for every session.

## Decisions

- A session stores a required project path reference and a watched boolean; new sessions default to watched.
- Existing sessions are backfilled to the server process home reference. The application has no per-login OS user mapping, so “user home” means `os.homedir()` for the Codeline service account.
- The home reference is stable across environments and resolves to the runtime home path; explicitly selected projects store their validated canonical folder path.
- New Project selects an existing folder, makes it the active project for subsequent sessions, and does not create a filesystem directory.
- Project paths must resolve to real, non-symlink directories within an allowed configured project root. Suggestions are bounded, asynchronous directory results from the server.
- Project groups are derived from session project associations; no separate project database entity is introduced.
- Recent and watched are flat active-session lists. Projects group active sessions in collapsible native details. Search uses the existing server search and renders the same two-line rows.
- Session secondary text is project label plus relative `updatedAt`; the timestamp title contains both local and UTC absolute values.
- The watch toggle lives in the selected session header and updates immediately through an authenticated session API.

## Approach

- Extend session persistence, Zero schema/query data, creation, fixture seeding, and authenticated actions for watched and project association.
- Add secure project path suggestion/validation APIs and shared active-project state used by the New Project dialog and session creation.
- Split sidebar list derivation and timestamp formatting into testable state/helpers, then compose the tabbed UI from app-local components and existing `#ui` primitives.
- Preserve desktop resizing, mobile drawer behavior, selection/navigation, loading/error states, and existing search URL behavior.

## Tasks

- [x] 1. Add and test session watched/project persistence, defaults/backfill, API toggle, Zero exposure, and creation validation.
- [x] 2. Add and test bounded asynchronous project-folder suggestions and confirmed-directory validation within configured roots.
- [x] 3. Add shared active-project state and the accessible New Project folder dialog; require the active/default project during session creation.
- [x] 4. Add tested sidebar derivation for recent, watched, project groups, search results, and two-line relative/absolute timestamps.
- [x] 5. Implement the sidebar action hierarchy, icon tabs, session rows, collapsible project groups, and selected-session watch toggle.
- [x] 6. Run focused and full verification, then browser-test desktop, narrow resized sidebar, and mobile drawer flows.

## Paths

- `src/session/db/`
- `src/session/actions/`
- `src/session/api/`
- `src/session/schema/`
- `src/database/migrations/`
- `src/database/zeroSchema.ts`
- `src/database/exampleDataFixture.ts`
- `src/database/exampleDataSeed.ts`
- `src/project/`
- `src/ui/SessionSidebar.tsx`
- `src/ui/SessionList.tsx`
- `src/ui/SelectedSession.tsx`
- `src/ui/codelineQueries.ts`
- `src/ui/sessionTargetSelectorStateCreate.ts`
- `src/ui/WorkspacePage.tsx`
- `src/ui/styles.css`
- `test/`
