# Pi-web UI alignment

## Goal

Align Codeline’s authenticated workspace UI with pi-web while preserving Codeline’s Solid/Zero architecture and product-specific navigation, authentication, projects, notes, status, and theme behavior.

## Decisions

- Recreate pi-web’s visual system and interaction patterns rather than copying React implementation details.
- Keep native scrollbars.
- Sidebar keeps session/workspace functionality but omits refresh, branch line, explorer, models, skills, and plugins.
- Top navigation exposes Workspace, Explorer, and Notes tabs; Activity is removed.
- Top-right controls are custom status, account menu, connection status, theme, then the right file-panel toggle.
- Server selection is removed from the workspace and remains available only through settings-oriented state/UI.
- Explorer shows only explicitly selected project folders, and the selected project is persisted.
- The right panel hosts the existing project file browser with pi-web-like tabs, resizing, and responsive behavior.
- Chat visuals follow pi-web while retaining current Codeline message, streaming, retry, stop, provider/model, and Zero behavior.

## Approach

- Establish shared pi-web-inspired tokens and responsive shell primitives in app-owned UI code.
- Reshape the global shell/navigation and account/status controls.
- Restyle and simplify the session sidebar.
- Restyle conversation history, streaming activity, and composer.
- Integrate selected-project Explorer behavior into a toggleable right panel and standalone Explorer route.
- Add focused state tests, then run formatting, typechecking, tests, build, and browser verification through managed services.

## Tasks

- [x] 1. Implement shared visual tokens and the responsive/resizable application shell.
- [x] 2. Implement navbar tabs, custom status, account popover, connection/theme ordering, and remove Activity.
- [x] 3. Migrate and simplify the session sidebar visuals and behavior.
- [x] 4. Migrate the chat history, activity, and composer visuals while preserving behavior.
- [x] 5. Implement selected-project-only Explorer persistence and right-panel integration; hide server selection from workspace.
- [x] 6. Add or update focused tests for navigation, account, project selection, and shell state.
- [x] 7. Format, typecheck, test, build, and verify desktop/mobile UI with agent-browser.

## Paths

- `src/ui/`
- `src/project/`
- `src/identity/ui/`
- `src/ui/styles.css`
- `test/`
- `docs/20260815_pi-web-ui-alignment.md`
