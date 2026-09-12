# Sidebar project autofill

## Goal

When starting a new session/chat, clicking a project in the left sidebar selects that project in the project selector at the top without creating the session immediately.

## Decisions

- Reuse the existing pending session project target state that already drives the top selector.
- Keep the existing explicit session-creation action separate so a project-name click does not POST a new session.
- Preserve the project row's expand/collapse behavior where practical.

## Approach

Expose a sidebar action that stores the clicked project as the pending target and navigates to the new-session route. Pass it through the existing sidebar/list/project-row component chain. Verify state behavior with focused tests and verify the user flow in the repository-managed preview service.

## Tasks

- [x] 1. Implement project-row selection for a new session and add focused automated coverage.
- [x] 2. Verify the completed flow in the managed preview UI.
