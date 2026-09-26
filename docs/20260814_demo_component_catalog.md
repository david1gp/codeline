# Demo Component Catalog

## Goal

Turn `/demo` into a backend-independent, clickable catalog of the product's real screens and reusable UI components, with deterministic mocked state supplied from outside view-only TSX components.

## Decisions

- Use the real production view components in demo specimens; do not maintain parallel demo-only copies of production markup.
- Keep state creation, effects, routing, API/Zero/filesystem access, and fixture behavior outside TSX view files.
- Preserve production behavior through non-TSX state/container composition while allowing demo fixtures to inject equivalent state and callbacks.
- Provide a persistent catalog directory grouped into Screens and Components, with representative ready, loading, empty, error, and active variants where relevant.
- Keep all `/demo` routes usable without application providers or backend services.
- Retain useful existing demo scenarios and expose them through the catalog rather than removing coverage.

## Approach

- Define a typed catalog registry and fixture/state contracts independent of rendering.
- Add a responsive demo catalog shell, directory index, item routing, and variant selection.
- Extract view-only boundaries from backend-coupled screen families, then compose those same views from production state and demo fixture state.
- Add focused state/registry tests and verify catalog navigation and interactions in a browser with backend services unavailable.

## Tasks

- [x] 1. Add the typed demo catalog registry, route resolution, catalog shell, and clickable Screens/Components index while preserving existing scenarios.
- [x] 2. Make the workspace/session screen family injectable through view-only TSX boundaries and add real-component demo specimens.
- [x] 3. Make the notes screen family injectable through view-only TSX boundaries and add screen/component specimens with representative states.
- [x] 4. Make the files/project screen family injectable through view-only TSX boundaries and add browser/Git specimens backed only by fixtures.
- [x] 5. Complete coverage for remaining reusable UI components and existing scenarios in the catalog directory.
- [x] 6. Add or update focused tests, run formatting/typecheck/tests/build, and browser-verify navigation, variants, interactions, responsiveness, and zero backend dependency.

## Paths

- `src/ui/demo/`
- `src/ui/UiRouter.tsx`
- `src/ui/WorkspacePage.tsx`
- `src/ui/SelectedSession.tsx`
- `src/ui/SessionChat.tsx`
- `src/ui/FilesPage.tsx`
- `src/project/ProjectBrowser.tsx`
- `src/project/ProjectGitPanel.tsx`
- `src/note/ui/`
- `src/message/ui/`
- `src/providers/ui/`
- `src/session/ui/`
- `test/`
