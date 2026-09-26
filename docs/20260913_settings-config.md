# Settings configuration

## Goal
- Consistent right-side navigation and a T3 Code-inspired settings sidebar.
- Visual editors for subagents, skills, and commands in separate sections.
- Backend-independent demos at `/demo/config/subagents`, `/demo/config/skills`, and `/demo/config/commands`, listed in `/demo`.

## Decisions
- Reuse existing libraries and read-only `ui` components; keep app-specific components in `src/ui`.
- Preserve existing settings features and use shared editor components for settings and demos.
- Use existing persistence where applicable; otherwise make local persistence explicit rather than imply runtime integration.
- Use repository-managed combined preview for verification and repository deployment workflow.

## Approach
- Borrow grouped navigation, compact rows, and active-section styling from the local T3 Code checkout.
- Implement visual editing and deterministic demo fixtures without backend dependencies.
- Verify routes, interactions, responsive navigation, and relevant tests with maximum concurrency one.

## Tasks
1. Completed: implement settings sidebar, consistent navigation, visual configuration sections, demo routes and catalog entries.
2. Completed: verify implementation with focused checks and live managed-preview browser testing; fix identified issues.
3. Completed: use a Luna subagent with the commits skill, then deploy and report review URLs.
