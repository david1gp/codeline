# Remote Client Library and CLI

## Goal

Make Codeline usable from another Bun/TypeScript project and from a non-interactive `codeline` CLI to ask an agent questions or perform work through an already-running Codeline server. Neither the imported client nor the CLI starts or manages a server.

## Decisions

- Keep Bun as the supported package and CLI runtime.
- Build the CLI as a client of the existing HTTP and SSE APIs only; server lifecycle remains outside the CLI.
- Use `@stricli/core` for command parsing and Valibot for CLI, environment, request, and response validation.
- Add an importable `codelineClientCreate` convenience API while continuing to expose internal source modules through package subpath exports without stability guarantees.
- Reuse existing session, chat, run snapshot, cancellation, event, and Valibot schema modules rather than introduce a parallel protocol.
- The client supports creating a session, attaching to an existing session/run, submitting a prompt as a run, streaming or waiting for completion, and cancellation.
- The initial CLI command is `codeline run [prompt...]`; it accepts positional prompt text or stdin, creates a session by default, and uses `--session` to continue an existing session.
- Initial run options are `--url`, `--token`, `--project`, `--server`, `--agent`, `--model`, `--effort`, `--session`, `--title`, `--format`, `--detach`, `--timeout`, and `--env-file`.
- Use `--agent` rather than `--mode`; Codeline agent configuration already represents primary/subagent behavior. Do not initially expose provider, tool permission, attachment, or arbitrary provider-option flags.
- Default behavior waits for completion, streams human-readable output, cancels the remote run on interruption or timeout, and returns a nonzero exit code for connection, validation, authentication, or run failures.
- Resolve client configuration in this order: CLI options, process environment, selected `.env`, schema defaults. Existing process values are not overwritten.
- Load `<cwd>/.env` when present. `--env-file` replaces that default and fails clearly if the explicit file cannot be read.
- Require a server URL from `--url` or `CODELINE_URL`; do not silently select or start a local server.
- Support `CODELINE_TOKEN`/`--token` as an authorization bearer credential for HTTP and SSE. Extend the existing authentication middleware to accept an existing opaque identity-session token as bearer authentication while preserving browser cookie authentication.
- Point package exports and the Bun `bin` at TypeScript source initially; do not add a publication-grade compilation or declaration pipeline.

## Approach

- Extend the typed HTTP client with a base URL, shared authorization headers, injected fetch, and abort support.
- Add small client functions over the existing API routes and schemas, then compose them in `codelineClientCreate` and a high-level run convenience function.
- Extract a standalone async SSE event stream from the existing browser-oriented event feed primitives, preserving replay cursors and filtering by session/run.
- Add bearer-token handling at the existing server authentication boundary so the same credential works for regular HTTP and SSE requests.
- Add Valibot-backed dotenv loading and normalized CLI configuration, with no secret output.
- Implement `codeline run` as a thin Stricli adapter over the importable client functions.
- Add source package exports, local-consumer tests, CLI tests, remote API integration tests, and combined-preview verification.

## Tasks

- [ ] 1. Add source-based root and wildcard package exports, separate package imports from executable server startup, and verify importing the package has no startup side effects.
- [ ] 2. Extend the existing typed HTTP transport with base URL, bearer token/headers, fetch injection, and abort support while preserving current browser callers.
- [ ] 3. Add and test importable client operations for session creation/detail, active runs/snapshots, run submission, waiting, streaming with SSE replay, and cancellation; add a high-level run convenience operation.
- [ ] 4. Accept existing opaque identity-session tokens through `Authorization: Bearer` in the authentication middleware for HTTP and SSE, while preserving cookie authentication and user scoping.
- [ ] 5. Implement and test Valibot-backed loading for process variables, default `.env`, explicit env-file paths, precedence, malformed values, missing URL, and missing explicit files.
- [ ] 6. Add `@stricli/core` and implement `codeline run [prompt...]` with stdin, the MVP options, session create/attach behavior, streaming/waiting/detach modes, structured output, timeout, interruption cancellation, and exit-code tests.
- [ ] 7. Smoke-test package imports and direct internal-module imports from another Bun project, and integration-test CLI/client calls against the existing API and SSE server.
- [ ] 8. Document the TypeScript client, CLI commands/options, authentication, environment precedence, output contracts, and verify the repository suite plus the repository-managed combined preview service.

## Paths

- `package.json`
- `src/index.ts`
- `src/client/codelineClientCreate.ts`
- `src/client/codelineRun.ts`
- `src/client/codelineEventStreamCreate.ts`
- `src/api/client/apiHttpClientCreate.ts`
- `src/session/schema/sessionCreateRequestSchema.ts`
- `src/session/schema/sessionChatRequestSchema.ts`
- `src/run/client/runCancelCommand.ts`
- `src/events/client/eventFeedCreate.ts`
- `src/identity/api/authenticationMiddleware.ts`
- `src/configuration/environmentLoad.ts`
- `src/configuration/environmentParse.ts`
- `src/cli/index.ts`
- `src/cli/commands/runCommand.ts`
- `src/**/*.test.ts`
- `README.md`
