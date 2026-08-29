# Structured file tools

## Goal

Add reliable model-facing `read`, `write`, and `edit` tools backed by a small Deepseek-harness-style filesystem core, while keeping `bash` unchanged and avoiding permissions, approvals, sandboxing, and patch support.

## Decisions

- Do not add `apply_patch`, native provider patch tools, or the OpenAI-specific Apply Patch contract.
- Use `~/opensource/deepseek-harness/packages/fs/{fs,fs-local,tool-fs}` as the primary implementation reference, adapting its contracts to Codeline rather than adding it as a dependency.
- Copy the relevant Deepseek Harness tests into Codeline and adapt them to Codeline's APIs and reduced feature set; retain their correctness cases rather than rewriting weaker tests from scratch.
- Work test-first in three phases: establish public interfaces and schemas, port the reduced test suite against those contracts, then implement until the tests pass.
- Treat the filesystem tools as correctness and model-ergonomics features, not security boundaries.
- Keep `bash` available independently; do not restrict its existing behavior.
- Accept relative paths, absolute paths, and `~`; resolve relative paths from the project root and return normalized paths.
- Use bounded streaming reads, opaque file versions, atomic writes, atomic exact-string edits, and structured filesystem errors.
- Require the version returned by `read` when `write` replaces an existing file; allow versionless creation of a missing file.
- Make `edit` apply one or more exact, unique, non-overlapping replacements atomically against the current file; reject missing, ambiguous, overlapping, and no-op edits without fuzzy matching.
- Preserve UTF-8 BOM and existing LF/CRLF style for edits and replacements.
- Reuse Codeline's `Result`, timeout, abort, output-limit, immutable manifest, and generic stream rendering conventions.
- Add no operation-specific UI or stream event format in this phase.
- Exclude Deepseek Harness coverage for permissions, escalation, sandbox containment, observation policy, image reads, compatibility editors, Windows-specific behavior, and features not listed in this plan.

## Approach

- Define the filesystem and tool contracts from `~/opensource/deepseek-harness/packages/fs/fs/src/{index,types}.ts` and `tool-fs/src/{read,write,edit}.ts` without implementing filesystem behavior.
- Copy and adapt the applicable cases from Deepseek Harness's `fs-local` and `tool-fs` tests into focused Codeline tests, removing only cases for excluded features or incompatible public contracts.
- Implement the local filesystem service from `fs-local/src/fsio.ts`, then implement `read`, `write`, and `edit` in that order against the already-ported tests.
- Port registry/provider integration tests before registering the tools through Codeline's existing generic registry, provider loop, manifests, and selectors.
- Verify the filesystem core, tool actions, registry/provider integration, manifests, and existing generic activity rendering; run tests with concurrency 1 and finish with the repository-managed combined preview service.

## Tasks

- [x] 1. Create contracts only: adapt `deepseek-harness/packages/fs/fs/src/{index,types}.ts` into `src/tools/filesystem/{fileSystem,fileSystemError,fileTarget,fileVersion}.ts`; define `src/tools/schema/{read,write,edit}Tool{Input,Output}Schema.ts` and the action/runtime dependency interfaces without implementing filesystem or tool behavior.
- [x] 2. Port filesystem tests first: copy and reduce applicable cases from `deepseek-harness/packages/fs/fs-local/tests/{fsio,filesystem}.spec.ts` into `test/{fileSystemLocalCreate,fileTextReplacementApply}.test.ts`, covering path normalization, text detection, versions, stale writes, atomic publication, aborts, and replacement conflicts against the Task 1 contracts.
- [x] 3. Port tool tests first: copy and reduce applicable cases from `deepseek-harness/packages/fs/tool-fs/tests/{tools,error,read-render,integration}.spec.ts` into `test/{readExecute,readToolCreate,writeExecute,writeToolCreate,editExecute,editToolCreate}.test.ts`, covering bounded reads, versions, creation, guarded replacement, exact edits, structured errors, atomicity, BOM and line endings.
- [x] 4. Implement the filesystem core: adapt `deepseek-harness/packages/fs/fs-local/src/fsio.ts` into `src/tools/filesystem/{fileSystemLocalCreate,fileTextReplacementApply}.ts` until the Task 2 tests pass, excluding permissions, containment sandboxing, observation policy, images, and Windows-specific behavior.
- [x] 5. Implement `read`: adapt `deepseek-harness/packages/fs/tool-fs/src/{read,read-target,read-render,error}.ts` into `src/tools/actions/readExecute.ts` and `src/tools/runtime/readToolCreate.ts` until the read cases from Task 3 pass.
- [x] 6. Implement `write`: adapt `deepseek-harness/packages/fs/tool-fs/src/{write,error}.ts` into `src/tools/actions/writeExecute.ts` and `src/tools/runtime/writeToolCreate.ts` until the write cases from Task 3 pass.
- [x] 7. Implement `edit`: adapt `deepseek-harness/packages/fs/tool-fs/src/{edit,error}.ts` into `src/tools/actions/editExecute.ts` and `src/tools/runtime/editToolCreate.ts` until the edit cases from Task 3 pass.
- [x] 8. Port integration tests before integration code: adapt registration cases from `deepseek-harness/packages/fs/tool-fs/src/index.ts` and `tool-fs/tests/tools.spec.ts` into `test/fileToolRegistration.test.ts`, and update existing manifest/provider tests to specify `read`, `write`, and `edit` alongside `bash`.
- [x] 9. Implement integration: extend `src/tools/schema/toolNameSchema.ts`, immutable execution manifests, agent/resource selection, registry construction, and `src/providers/runtime/providerDelegationToolLoopCreate.ts` until the Task 8 tests pass.
- [~] 10. Verify generic durable tool events and activity rendering remain bounded and useful without new event types, update only necessary existing tests, then run full serial validation and combined managed preview verification.

## Paths

- `docs/20260829_structured_file_tools.md`
- `~/opensource/deepseek-harness/packages/fs/fs/src/`
- `~/opensource/deepseek-harness/packages/fs/fs-local/src/`
- `~/opensource/deepseek-harness/packages/fs/fs-local/tests/fsio.spec.ts`
- `~/opensource/deepseek-harness/packages/fs/fs-local/tests/filesystem.spec.ts`
- `~/opensource/deepseek-harness/packages/fs/tool-fs/src/`
- `~/opensource/deepseek-harness/packages/fs/tool-fs/tests/tools.spec.ts`
- `~/opensource/deepseek-harness/packages/fs/tool-fs/tests/error.spec.ts`
- `~/opensource/deepseek-harness/packages/fs/tool-fs/tests/read-render.spec.ts`
- `~/opensource/deepseek-harness/packages/fs/tool-fs/tests/integration.spec.ts`
- `src/tools/filesystem/`
- `src/tools/schema/`
- `src/tools/actions/`
- `src/tools/runtime/`
- `src/providers/runtime/providerDelegationToolLoopCreate.ts`
- `src/run/schema/runExecutionManifestSchema.ts`
- `src/run/db/runRepositoryCreate.ts`
- `src/ui/sessionResourceSelectorStateCreate.ts`
- `src/ui/SessionResourceSelector.tsx`
- `src/stream/`
- `agents/`
- `test/`
