# Session resilience

## Goal

Identify why real OpenCode sessions used with Codeline stop or lose streams, then make Codeline sessions recover and continue reliably.

## Decisions

- Use local OpenCode source and real session evidence as primary inputs.
- Use Hermes Agent as a mature reference where its recovery tests or patterns apply.
- Preserve the current managed-service architecture and existing session semantics.
- Add deterministic regression coverage for every reproduced interruption mode.

## Approach

- Inspect Codeline session and stream handling, local OpenCode internals, and available real session evidence.
- Sync and assess Hermes Agent for relevant interruption and continuation behavior.
- Implement the smallest recovery changes justified by evidence.
- Verify focused tests, the full relevant suite at concurrency 1, and the combined managed preview.
- Commit the completed work in logical conventional commits, push, and deploy through the repository workflow.

## Tasks

- [x] 1. Inventory the Codeline session lifecycle, tests, managed services, deploy workflow, and real session evidence.
- [x] 2. Analyze OpenCode interruption/stream behavior and correlate concrete failure modes with real usage evidence.
- [x] 3. Sync Hermes Agent and extract applicable resilience patterns and tests.
- [x] 4. Implement and verify regression coverage and session recovery changes incrementally.
- [x] 5. Verify the combined managed preview and relevant test suite.
- [x] 6. Use the commits workflow, push, and deploy.

## Paths

- `docs/20260828_session_resilience.md`
- `src/`
- `test/`
- `tests/`
- `ops/dev/`
- `/home/david/opensource/opencode`
- `/home/david/opensource/hermes-agent`
