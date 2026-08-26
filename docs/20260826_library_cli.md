# Library and CLI

## Goal

Make Codeline immediately usable from another Bun project and through a `codeline` CLI without designing a release-grade public API. The CLI must use `@stricli/core` for command parsing and Valibot for runtime validation, and both entry points must support validated environment configuration from process variables, a default `.env`, or an explicitly selected `.env` file.

## Decisions

- Keep Bun as the supported runtime because the server and SQLite implementation already depend on Bun APIs.
- Expose the existing source modules through package subpath exports; internal modules may be imported directly and carry no stability guarantee.
- Add only a thin root entry that re-exports the immediately useful server startup and environment functions. It is a convenience barrel, not a curated public API.
- Keep the executable bootstrap separate so importing the root package does not start the server.
- Provide `codeline start [--env-file <path>]` as the initial installed command.
- Resolve environment values in this order: process environment, selected `.env` values, then schema defaults. Existing process values are never overwritten.
- Load `<cwd>/.env` when present by default. `--env-file` replaces the default path and reports a validation-friendly error when the specified file cannot be read.
- Parse command structure and options with `@stricli/core`, then validate normalized CLI input and resolved environment with Valibot before starting the server.
- Point package exports at the TypeScript source for Bun consumers and point `bin` at the Bun CLI source. Do not add a separate library compilation or declaration pipeline yet.
- Preserve the repository-managed combined preview service and existing application entry point.

## Approach

- Introduce environment loading and validation as runtime-neutral functions accepting a plain environment record, working directory, and optional env-file path.
- Refactor server startup to consume resolved, typed configuration instead of reading `Bun.env` directly.
- Export existing source modules with a wildcard package export and provide a small root barrel without hiding internal workings.
- Add a Stricli command tree and a thin executable bootstrap that resolves environment, validates input, invokes the library API, and maps failures to concise stderr output and nonzero exit codes.
- Extend package metadata and test local Bun package consumption without adding publication machinery.

## Tasks

- [ ] 1. Separate importable root exports from executable startup, add wildcard source-module exports, and verify direct internal imports from another Bun package.
- [ ] 2. Implement and unit-test Valibot-backed environment loading for process variables, default `.env`, explicit env-file paths, precedence, malformed input, and missing explicit files.
- [ ] 3. Refactor server startup to accept resolved configuration while preserving current application startup and managed-preview behavior.
- [ ] 4. Add `@stricli/core` and implement `codeline start --env-file <path>` with Valibot validation, help output, error handling, and CLI tests.
- [ ] 5. Add source-based package exports and the Bun CLI `bin`; smoke-test local package import, direct internal-module import, and CLI invocation.
- [ ] 6. Document library and CLI usage, environment precedence, default/explicit `.env` behavior, and verify the repository test suite plus combined managed preview service.

## Paths

- `package.json`
- `src/index.ts`
- `src/server/serverStart.ts`
- `src/configuration/environmentSchema.ts`
- `src/configuration/environmentLoad.ts`
- `src/configuration/environmentParse.ts`
- `src/cli/index.ts`
- `src/cli/commands/startCommand.ts`
- `src/**/*.test.ts`
- `README.md`
