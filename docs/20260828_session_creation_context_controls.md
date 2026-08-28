# Session creation context controls

## Goal

Replace the broad “Session resources” presentation with focused session-creation controls: a full-height prompt editor, compact multi-select controls for skill groups, skills, and tools, and an editable prompt/context popover that includes only loaded instruction locations with source paths and context-size estimates.

## Decisions

- Session creation inherits current skill and tool defaults; checkbox changes apply only to the new session.
- Skill groups, individual skills, and tools use the existing `SelectMultiple` component with a compact presentation in the right sidebar.
- The main prompt editor fills all remaining vertical space.
- The system prompt and merged applicable `AGENTS.md` context are editable for the new session.
- `AGENTS.md` discovery is limited to loaded/listed/included project locations; unrelated instruction files are excluded.
- Every included instruction source shows its file path for debugging.
- Context estimates are shown for the system prompt and included instruction content.
- Existing-session resource details are replaced by a compact execution-context view of the captured session inputs.

## Approach

- Current context: desktop and mobile creation, project handoff, selector changes, editable system and AGENTS.md context, canonical paths, estimates, immutable capture, reload persistence, and cleaned existing-session inspection are verified. Delegated agents retain their own prompts, blank session prompts are supported, and older summaries remain compatible.
- Trace project-location loading, instruction discovery, create-payload assembly, and captured-resource rendering before changing boundaries.
- Restrict instruction discovery at the source so creation and captured summaries share the same relevant inputs.
- Recompose the creation UI without changing the established session-default resolution semantics.
- Extend the create payload and persisted execution context only where required for session-scoped prompt/instruction edits.
- Cover data filtering, payload behavior, layout, and interaction with focused tests and the managed preview service.

## Tasks

- [completed] 1. Map loaded-location instruction discovery, session prompt persistence, current selectors, and `SelectMultiple` capabilities.
- [completed] 2. Restrict instruction sources to loaded/listed/included locations and add focused tests.
- [completed] 3. Add session-scoped editable system/instruction context and context-size estimation through creation and persistence.
- [completed] 4. Rebuild new-session layout with a full-height editor and compact right-sidebar multi-select controls.
- [completed] 5. Replace existing-session “Session resources” with a compact captured execution-context inspector.
- [completed] 6. Run focused tests and verify the complete flow through the repository-managed preview service in a browser.

## Paths

- `src/ui/WorkspaceSetupPanel.tsx`
- `src/ui/SessionResourceSelector.tsx`
- `src/ui/SelectedSession.tsx`
- `src/ui/sessionResourceSelectorStateCreate.ts`
- `src/session/actions/sessionCreate.ts`
- `src/session/api/sessionExecutionResourceSummaryCreate.ts`
- `src/run/actions/runExecutionManifestSelectionResolve.ts`
- `src/**/agent-instructions*`
- `ui/**/SelectMultiple*`
- `test/`
