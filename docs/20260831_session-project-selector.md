# Session Project Selector

## Goal

Place new-session project selection above the main message textarea and make it searchable, hierarchical, visually consistent with the sidebar, scrollable for long project lists, full-width on small screens, and able to complete the existing new-project flow.

## Decisions

- Remove project selection from the session context sidebar and render it directly above the new-session composer.
- Keep available registered projects and existing project-selection semantics as the selector's data source and behavior.
- Filter project options as the user types, with case-insensitive matching against visible project details.
- Exclude projects and parent-folder paths containing dot-prefixed segments from this selector.
- Present parent folders and nested project rows similarly to the sidebar, including folder icons and project avatars/favicons.
- Include a persistent Create/New Project action that opens the existing New Project dialog and selects the confirmed project.
- Constrain long option lists with vertical scrolling and use the available content width on small screens.
- Reuse repository UI components and libraries; keep app-specific behavior under `src/ui` and do not modify the read-only `ui` copy.

## Approach

- Current context: implementation and verification are complete. The managed preview was corrected to serve the active workspace rather than an obsolete temporary checkout. Focused tests, typecheck, format checks, build, diff checks, and desktop/mobile browser verification pass for dot-entry exclusion, folder/project hierarchy and icons, search, scrolling, responsive width, keyboard selection, and the complete New Project confirmation/selection flow.
- Isolate searchable project option derivation and selection behavior for focused testing.
- Build an app-specific accessible selector using existing popover/input/dialog primitives.
- Recompose the new-session creation layout so project selection precedes the textarea while the remaining skills/tools context stays in its current panel.
- Verify focused tests and desktop/mobile behavior through the repository-managed combined preview service.

## Tasks

- [x] 1. Add tested searchable project-option derivation and selection state.
- [x] 2. Implement the searchable, scrollable, responsive project selector with Create/New Project support.
- [x] 3. Move new-session project selection above the composer and remove it from the context sidebar.
- [x] 4. Run focused checks and browser verification on the managed preview service.
- [x] 5. Exclude dot-prefixed entries and render sidebar-like folder/project hierarchy with icons.
- [x] 6. Repair the New Project lifecycle and cover the complete selector-to-confirmation handoff.
- [x] 7. Run focused checks and verify hierarchy, responsive behavior, and the complete New Project flow in the managed browser.
