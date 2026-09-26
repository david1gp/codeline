# Goal

Improve session creation and project selection, expose the repository skills consistently, and run Codeline from the active checkout before committing and deploying the completed work.

# Decisions

- Show one empty-state line: “Select a conversation or start a new one.”
- Split the editable chat placeholder into two sentence-based lines.
- Use `SelectSingle` with non-selectable parent-folder headers, alphabetical folders/projects, and an “Uncategorized” fallback.
- Add an immutable built-in `All` skill preset, make it the default, include every discovered global and project skill, and disable individual skill editing while it is selected.
- Keep session skill snapshots stable after creation.
- Point the repository `.opencode/skills` path at its `.agents/skills` directory so both conventions expose the checked-in skills.
- Make the managed development service run from `/home/david/adaptive/codeline` rather than `/home/david/codeline`.
- Use repository-managed services and the combined preview for verification.

# Approach

- Correct the managed service checkout and add the repository skill-directory link.
- Make the conversation UI copy changes.
- Extend project registry data with parent-folder metadata and adapt the selector to grouped `SelectSingle` entries.
- Implement `All` in the skill domain, expose it as the default immutable preset, and reflect that state in both resource selectors.
- Run focused tests, then combined preview browser verification.
- Use the commits skill in a Luna subagent, push, and deploy through the repository workflow.

# Tasks

- [x] 1. Correct the managed service checkout and add `.opencode/skills` linkage.
- [x] 2. Simplify the no-conversation state and split the chat placeholder.
- [x] 3. Add parent-folder project data and the grouped project selector.
- [x] 4. Add the immutable default `All` skill preset and resource-selector behavior.
- [x] 5. Verify focused tests and the combined managed preview in a browser.
- [x] 6. Create and push conventional commits with the commits skill, then deploy.

# Paths

- `ops/dev/`
- `.opencode/skills`
- `.agents/skills/`
- `src/ui/SelectedSession.tsx`
- `src/ui/SessionChat.tsx`
- `src/ui/FilesProjectSelector.tsx`
- `src/ui/filesPageStateCreate.ts`
- `src/ui/filesScreenView.ts`
- `src/project/`
- `src/skills/`
- `src/ui/SessionCreationResourceSidebar.tsx`
- `src/ui/SessionResourceSelector.tsx`
- `test/`
