# Global agent presets and resource sets

## Goal

Move new-session skill/tool customization into operational global Configuration. Provide separate settings navigation entries for Skills, Skill sets, Commands, Command sets, Tools, Tool sets, Subagent sets, and Agent presets. New sessions choose a preset and may change its prefilled model. Existing sessions retain their captured resources.

## Product decisions

- Presets and sets are shared across projects and only configure global resources. Project-local skills, commands, and agents always load in their own project, without preset membership; same-name project entries override global entries.
- Global Skills and Commands edit their actual source files. Project-local files are not edited in Configuration. Built-in tools can only be enabled/disabled, not created.
- Global skill/command renames use create the new name then delete the old name; no in-place rename API is exposed.
- Each resource category has one default set. Newly created global entries join it; the default command set dynamically includes all global commands, including newly discovered commands.
- Entries can belong to multiple named sets. Drop onto another set prompts Copy or Move; dropping outside a set removes that membership, not the underlying resource. Use `@formkit/drag-and-drop` as in `~/personal/services`.
- A preset combines any number of skill, command, tool, and subagent sets; subagents may also be picked individually. Union membership by unique name, with no duplicate display. The preset pre-fills execution agent/model; model is changeable at creation.
- Preset changes affect future sessions, not existing captured session snapshots. Command sets limit available global commands; default includes all. Project-local commands remain available in their project.

## Architecture

- Reuse existing global `~/.agents/skills` and `~/.agents/commands` discovery paths and their project-precedence resolution. Keep Git-backed `CONFIG_STORE_DIR` configuration.json agent-target schema intact; store new global set/preset metadata in a separate validated server-owned configuration document within that directory, not browser localStorage. Avoid moving existing resource files.
- Reuse existing server-side session selection and immutable execution manifest. Resolve selected preset server-side at session creation, deduplicate by name and merge auto-loaded project-local resources; reject invalid selection rather than trusting client-generated effective resources.
- Preserve project resource overrides and existing project-local/command invocation semantics. Do not edit the read-only `ui/` library.
- Use existing app components and libraries before adding any dependency other than requested `@formkit/drag-and-drop`.

## Tasks

1. **Model/storage:** Add typed, validated global set/preset schema and server-owned persisted read/write operations, defaults, membership and deduplication semantics; targeted tests. Status: completed.
2. **File-backed global catalog editing:** Add authenticated global skill/command list/create/update/delete APIs backed by safe writes to their existing global files; preserve project discovery precedence and enforce unique names; targeted tests. Status: completed.
3. **Preset resolution and session creation:** Resolve sets/presets on server, apply tool and subagent selections, command availability and project-local automatic inclusion/override, model override, and preserve immutable session snapshots; focused tests. Status: completed.
4. **Configuration screens:** Replace local draft editor for operational resources with server-backed separate sidebar sections and forms for global entries, sets, and presets; built-in tool toggles; targeted UI/state tests. Status: completed.
5. **Drag/drop membership:** Integrate FormKit cross-list interactions and Copy/Move dialog, outside-drop membership removal, duplicate-safe merges, and accessible non-drag controls; targeted tests. Status: completed.
6. **Session UI:** Remove pre-session right/context sidebar resource customization and workspace setup resource toggles; select preset for a new session and allow model change, while leaving immutable session inspection intact; targeted tests. Status: completed.
7. **End-to-end verification:** Run focused serial tests, typecheck/build, test through repository-managed combined preview service and browser, fix only relevant failures. Status: completed.

## Current context

Global file/metadata APIs, settings editors, operational subagent catalog picker, preset/model creation UI, and server-side session resolution are implemented. Project-local executable agents load from `.agents/agents/<name>.md`, override same-name globals, and can be selected as primary agents without a global agent record; the effective catalog is captured with the session. Default sets retain future auto-inclusion while honoring explicit exclusions. The managed combined preview serves this checkout; browser verification covered cross-set Copy/Move/Cancel, outside-drop removal, preset set assignment/unassignment across reloads, and new-session preset/model selection. Global agent Markdown editing is intentionally not exposed; only its operational catalog is shown in Settings.
