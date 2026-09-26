# Subagent thread E2E

## Goal

Add an end-to-end browser test that sends a Luna agent a request to call a Luna subagent, sleep for 10 seconds, and respond `ok`; ensure the UI renders the subagent call and opens a right-side sidebar containing the subagent's streamed thread when clicked.

## Decisions

- Reuse the existing managed development services and deterministic test setup.
- Follow the local `~/opensource/opencode` implementation where Codeline lacks equivalent subagent-call thread behavior.
- Exercise the real browser UI and Luna agent flow rather than mocking the interaction.

## Approach

- Inspect the existing session event model, tool-call rendering, right sidebar, E2E harness, and the comparable OpenCode implementation.
- Add the smallest missing application behavior needed to expose and navigate a subagent thread.
- Add and run a browser E2E scenario for the complete Luna-to-Luna subagent interaction.

## Tasks

- [x] 1. Map current Codeline and OpenCode subagent-thread behavior and identify the exact implementation/test gaps.
- [x] 2. Implement the missing subagent-call display and right-sidebar streamed thread behavior.
- [x] 3. Add the Luna subagent browser E2E test and verify the focused scenario.
- [x] 4. Run final targeted checks and browser verification.

## Current context

- Parent delegation calls are matched to child streams through the persisted `delegationKey`.
- `delegate_task` activity is clickable and opens a `SubagentThreadPanel` while keeping the parent session selected.
- The child panel reuses session stream groups so in-flight child output remains live.
- Focused delegation, in-flight, and transient-activity tests are present; typecheck, unit tests, build, formatting, and diff checks pass.
- `e2e/lunaSubagentThread.spec.ts` drives the real Luna delegation through the managed preview environment.
- The focused Playwright scenario passes and verifies the visible delegation call, right-side child thread, and final `ok`; the sleep instruction is visible in the delegation entry because the child model has no separate sleep row.
- Final review found the child sidebar flow works in a real browser, but the parent ended with `child_run_limit_exhausted`/`assistant_empty` instead of its own final `ok`.
- Review also found child-link retry staleness, insufficient parent run/attempt scoping for in-flight links, an incomplete accessible name, and changed-file import ordering issues.
- Those UI/state/accessibility/format issues are fixed, and focused plus full automated checks pass.
- Same-task repeated Luna delegation now reuses the first child while distinct requests retain the one-child budget; a fresh browser run completed both child and parent with exact `ok`.
- Reused callers now observe the original child's terminal result without a second provider execution, including accepted/running concurrency.
- Repeated logical delegation calls with new tool-call IDs link to the original child using scoped normalized task and target-agent matching; distinct requests do not link.
- Final browser acceptance passes with the visible delegation task, linked right-side child thread, child `ok`, parent exact `ok`, and no terminal errors.
- Retry-transition observation and in-flight latest-attempt linkage are now covered and passing.
- The external Luna child stream persists only `text_delta` and `terminal` events and the child SSE endpoint is intentionally unavailable, so the browser test cannot inspect an internal sleep tool event or duration; it can verify the exact 10-second instruction, target child agent, live child outcome, and parent outcome.
- Final E2E asserts the exact instruction, `luna-high` target, clickable right-side thread, child exact `ok` with completed terminal, parent exact `ok`, and absence of visible run errors.

## Paths

- `src/`
- `tests/`
- `e2e/`
- `~/opensource/opencode`
