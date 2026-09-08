# Goal
- Show folder → project → session nesting in Pinned, Recent, and Search, including only matching sessions and their parent projects/folders.

# Decisions
- Preserve existing matching rules for each tab and existing Projects behavior.
- Reuse existing hierarchy rendering and project/folder associations, including uncategorized projects.
- Keep creation and management controls specific to Projects.

# Approach
- Derive filtered hierarchies from each tab's existing session results and reuse the Projects hierarchy presentation.
- Verify focused tests and the combined repository-managed preview.

# Tasks
1. Complete: Implement filtered hierarchy derivation and focused unit tests. Shared `hierarchies` exposes groups for all four tabs.
2. Complete: Reuse hierarchy rendering for all tabs and verify relevant tests/typecheck. Filtered projects render expanded; management controls remain Projects-only.
3. Partial: Browser-check all four tabs in the managed preview; full folder-associated session coverage remains pending.
