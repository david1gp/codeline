# New project session flow

## Goal

Make `/sessions` → `New Session` → `New project` rename the primary action to `New Project` and reliably open the project-creation flow.

## Decisions

- Use a single `CorvuDialog` whose content and title swap between the session step and the project step. Nested `@corvu/dialog` modals dismiss each other (the project dialog's overlay is covered/closed by the session dialog), so only one modal is open at a time.
- Selecting `New project` in the `<select>` only renames the primary action to `New Project`; submitting that action swaps the dialog to the project step. Confirming a folder returns to the session step with the new project selected.
- Extract the project form body into a reusable `NewProjectForm` so the standalone `NewProjectDialog` (Projects tab in `SessionList`) keeps working.

## Approach

- `newSessionDialogStateCreate` tracks `newProjectOpen`, exposes `dialogTitle`/`dialogDescription`, `primaryActionLabel`, `newProjectStart` (on submit), and `projectConfirmed`.
- `NewSessionDialog` renders one dialog and `<Show when={newProjectOpen()}>` swaps between the session `<form>` and `NewProjectForm`.
- `NewProjectForm` holds the folder-path input, suggestions, and `Use Project` submit; used by both `NewSessionDialog` and `NewProjectDialog`.

## Tasks

- [x] Single-dialog content swap; rename primary action; open project step on submit.
- [x] Extract `NewProjectForm`; keep standalone `NewProjectDialog` working.
- [x] Unit coverage in `test/newSessionDialogStateCreate.test.ts`.
- [x] E2E coverage in `e2e/newProjectFlow.spec.ts`.

## Paths

- `src/ui/NewSessionDialog.tsx`
- `src/ui/newSessionDialogStateCreate.ts`
- `src/ui/NewProjectForm.tsx`
- `src/ui/NewProjectDialog.tsx`
- `test/newSessionDialogStateCreate.test.ts`
- `e2e/newProjectFlow.spec.ts`

## Current context

- Verified live at `https://preview.codeline.work/sessions`: button renames to `New Project`, clicking it swaps the same dialog to the project step reliably across repeated attempts; close+reopen resets to the session step.
- Unit (687 pass) and full e2e (3 pass) green. Typecheck and format clean.
- E2E account issuance/purge (`scripts/e2eOrganizationMemberSessionsIssue.ts` / `...Purge.ts`) works against the managed local dev services; the earlier sign-in blocker is resolved.
