# Session Project Selector

## Goal

Place new-session project selection above the main message textarea and make it searchable, scrollable for long project lists, full-width on small screens, and able to open the existing new-project flow.

## Decisions

- Remove project selection from the session context sidebar and render it directly above the new-session composer.
- Keep available registered projects and existing project-selection semantics as the selector's data source and behavior.
- Filter project options as the user types, with case-insensitive matching against visible project details.
- Include a persistent Create/New Project action that opens the existing New Project dialog and selects the confirmed project.
- Constrain long option lists with vertical scrolling and use the available content width on small screens.
- Reuse repository UI components and libraries; keep app-specific behavior under `src/ui` and do not modify the read-only `ui` copy.

## Approach

- Current context: focused tests, typecheck, format checks, build, and managed combined-preview health pass. Desktop/mobile browser verification passes placement, sidebar removal, case-insensitive filtering, keyboard selection, scroll constraints, and responsive width; clicking the selector's New Project action currently closes the popover without opening the existing dialog and needs correction.
- Isolate searchable project option derivation and selection behavior for focused testing.
- Build an app-specific accessible selector using existing popover/input/dialog primitives.
- Recompose the new-session creation layout so project selection precedes the textarea while the remaining skills/tools context stays in its current panel.
- Verify focused tests and desktop/mobile behavior through the repository-managed combined preview service.

## Tasks

- [x] 1. Add tested searchable project-option derivation and selection state.
- [x] 2. Implement the searchable, scrollable, responsive project selector with Create/New Project support.
- [x] 3. Move new-session project selection above the composer and remove it from the context sidebar.
- [ ] 4. Run focused checks and browser verification on the managed preview service.
