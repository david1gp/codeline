# Note workspace

## Goal

Turn the note detail experience into a three-column workspace with a project-scoped note list, note editing, and note preview/action space. Persist each note's position within its project and provide move-up/down controls.

## Decisions

- Keep canonical note URLs as `/notes/:noteId`; the note ID already identifies the note and its current project, while project paths are mutable and are not project IDs.
- Represent notes with no `projectPath` as the synthetic **Unassigned** group without changing nullable storage semantics.
- Persist an integer ordering value on each note, scoped logically by user and nullable project path.
- Reordering swaps adjacent notes and validates ownership and project membership.
- Keep the existing explicit-save editing behavior and reuse existing note editor/preview components.
- Make the three-column desktop layout responsive rather than forcing three columns on narrow screens.

## Approach

- Add and backfill a note ordering column in a new migration, then expose it through Drizzle and Zero schemas.
- Extend note mutations and tests with deterministic create/move/project-change ordering behavior.
- Add workspace state that derives project groups, selected note context, and ordered project notes.
- Compose the existing list/detail/editor/preview functionality into three panes and add accessible boundary-aware ordering controls.
- Preserve direct note links and route fallback behavior.

## Tasks

1. **Complete** — Add the note ordering migration and schema fields, including deterministic backfill and schema tests.
2. **Complete** — Implement ordering semantics in note mutations and query/state code with focused tests.
3. **Complete** — Build the responsive three-column note workspace and move controls while preserving direct routes.
4. **Complete** — Verify the complete change with unit, type, format, build, database, and browser checks; fix only regressions caused by this feature.

## Current context

- The working tree contains unrelated concurrent durable-run and session-target changes; preserve them and make only narrowly scoped note-workspace edits.
- Migration `0006_note_ordering.sql` and its journal/schema/test changes are persisted; `sort_order` is nullable for compatibility and existing notes are deterministically backfilled per user/project by `updated_at DESC, id DESC`.
- Ordering behavior is persisted: create and project moves append, source/destination groups compact, delete compacts, and `note.reorder({ id, projectPath, direction })` swaps adjacent positions with boundary no-ops and validation.
- `/notes/:noteId` now renders a responsive workspace with project groups, active-project notes, the existing explicit-save editor, a preview/actions pane, and accessible boundary-aware move controls.
- Unit tests, typecheck, formatting, database checks/migration, build, managed services, responsive browser flows, ordering persistence, and accessibility pass; only unrelated repository-wide Biome diagnostics remain.

## Paths

- `src/note/db/noteTable.ts`
- `src/database/migrations/`
- `src/database/zeroSchema.ts`
- `src/note/noteMutators.ts`
- `src/note/ui/NotesPage.tsx`
- `src/note/ui/NotePage.tsx`
- `src/note/ui/notesPageStateCreate.ts`
- `src/note/ui/notePageStateCreate.ts`
- `src/ui/codelineQueries.ts`
- `src/ui/NoteRoutePage.tsx`
- `src/ui/UiRouter.tsx`
- `test/databaseSchema.test.ts`
- `test/noteMutators.test.ts`
- `test/appRouteResolve.test.ts`
