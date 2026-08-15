# UI Component and Theme Refactor

## Goal

Replace duplicated native controls with standard `#ui` primitives where their APIs fit, retain app-specific composites, and remove fixed surface/text colors that prevent correct light and dark themes.

## Decisions

- Keep layout, stateful domain composites, session-tree behavior, and status compositions in `src/ui`; replace their generic buttons, inputs, selects, and icons rather than forcing unsuitable library composites.
- Treat `./ui` as read-only and import primitives through `#ui/...`.
- Preserve application-owned state and accessibility behavior when adapting signal-oriented `#ui` controls.
- Use existing semantic theme classes from `src/ui/styles.css`; add narrowly scoped semantic tokens only when no existing status or code-preview token fits.
- Preserve intentional status meaning with semantic accent, success, warning, and danger tokens.

## Approach

- Migrate low-risk button, icon, and input elements first.
- Adapt project and agent selectors to `SelectSingleNative` without changing domain behavior.
- Convert fixed demo and production surface, text, border, and shadow colors to semantic tokens in bounded file groups.
- Validate types, tests, formatting, build, and both themes in the managed development application.

## Tasks

- [x] 1. Replace generic file-panel, retry/action, and search controls with matching `#ui` button, icon, and input primitives.
- [x] 2. Replace project and agent native selects with `#ui` select primitives using the smallest state adapters.
- [x] 3. Convert catalog shell, catalog index, and surface panel styling to semantic theme tokens.
- [x] 4. Convert demo workspace, shell, message, and production PDF surface styling to semantic theme tokens.
- [x] 5. Run repository validation and browser-check representative light/dark application and demo states; fix only regressions introduced by this refactor.

## Paths

- `.env.example`
- `src/ui/App.tsx`
- `src/ui/FilesPanel.tsx`
- `src/ui/FilesProjectSelector.tsx`
- `src/ui/SessionList.tsx`
- `src/ui/SessionTargetSelector.tsx`
- `src/ui/filesPageStateCreate.ts`
- `src/ui/filesScreenView.ts`
- `src/ui/demo/DemoCatalogIndex.tsx`
- `src/ui/demo/DemoCatalogShell.tsx`
- `src/ui/demo/DemoMessage.tsx`
- `src/ui/demo/DemoShell.tsx`
- `src/ui/demo/DemoSurfacePanel.tsx`
- `src/ui/demo/DemoWorkspacePanel.tsx`
- `src/ui/demo/demoFilesScreenStateCreate.ts`
- `src/ui/demo/demoThemeSwitcherStateCreate.ts`
- `src/project/ProjectBrowser.tsx`
- `src/ui/styles.css`
- `test/demoThemeSwitcherStateCreate.test.ts`
- `test/filesPageStateCreate.test.ts`
- `test/zeroSyncConfiguration.test.ts`
