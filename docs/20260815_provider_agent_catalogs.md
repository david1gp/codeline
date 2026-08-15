# Provider and Agent Catalogs

## Goal

Make checked-in `providers/{provider}/{model}.yml` and `agents/{name}.md` files the project source for provider models and agents; migrate the current OpenCode build/delegate setup and subagents; preserve model limits, costs, capabilities, effort variants, provider defaults, and environment-backed credentials; and allow grouped provider/model selection in the UI.

## Decisions

- Provider and agent IDs derive from directory/file names; agent Markdown bodies are prompts and YAML/frontmatter carries validated metadata.
- Every model file is self-contained. Files under one provider directory must agree on provider connection and transport settings.
- Provider files retain OpenCode metadata, including limits, tiered costs, modalities, capabilities, status, provider options, and model-specific effort variants. Generation defaults only contain parameters supported by the selected transport; incorrect temperature and 100000-token defaults are removed.
- Secret values are never copied into API responses, snapshots, or logs; immutable snapshots retain only environment-variable references for execution-time resolution.
- The filesystem catalog is loaded deterministically and compiled into the existing persisted execution configuration. Existing persisted runs/configurations remain readable during migration.
- Agents without an explicit model inherit the project catalog default; OpenCode `cliproxy` is represented by Codeline's existing `cliproxyapi` provider ID.
- The selector uses provider groups as non-selectable labels and models as selectable entries; effort choices come from the selected model's variants.
- Unsupported model transports remain represented in catalog data but are disabled for execution and selection until Codeline has the matching adapter.

## Approach

- Add validated catalog schemas and a deterministic loader for root-level provider YAML and agent Markdown.
- Check in converted OpenCode provider models and all primary/subagent files without secret values.
- Reconcile catalog agents into current agent persistence/configuration storage and carry prompt/model metadata into immutable execution snapshots.
- Expose a redacted provider/model catalog API and resolve cross-provider model overrides through the catalog.
- Replace the flat model selector with grouped provider/model choices and model-specific effort selection.

## Tasks

- [x] 1. Add catalog schemas, parsing, normalization, revisioning, and focused tests.
- [x] 2. Add all converted provider model YAML and agent Markdown files from the current OpenCode configuration.
- [x] 3. Reconcile catalog agents/configurations into persistence and update schema/data-model projections.
- [x] 4. Resolve catalog models and agent prompts during run/delegation execution while preserving legacy snapshots.
- [x] 5. Add a redacted catalog API for grouped providers, models, metadata, and effort variants.
- [x] 6. Update selector state and UI to show non-selectable provider labels with model choices below.
- [x] 7. Run focused/full validation and browser verification; update project documentation for catalog editing and seeding.

## Paths

- `providers/{provider}/{model}.yml`
- `agents/{name}.md`
- `src/agents/schema/`
- `src/providers/schema/`
- `src/providers/catalog/`
- `src/database/exampleDataFixture.ts`
- `src/database/exampleDataConfigurationReconcile.ts`
- `src/run/schema/runExecutionSnapshotSchema.ts`
- `src/providers/api/`
- `src/providers/runtime/`
- `src/providers/ui/`
- `src/session/`
- `scripts/dbSeed.ts`
- `test/`
- `README.md`
