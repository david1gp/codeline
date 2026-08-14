# Agent simulation test harness

## Goal

Add a provider-free `/simulate` surface that deterministically simulates realistic agent streaming, thinking, tool activity, failures, cancellation, and retry outcomes so behavior and UI states can be validated interactively and through automated tests.

## Decisions

- Keep `/demo` static and create a separate `/simulate` bounded context for interactive behavior.
- Use checked-in, sanitized fixtures derived from repository-owned examples under `~/adaptive`; never read live user data or call an LLM provider.
- Exercise production-shaped normalized execution events and retry rules while keeping the harness client-local and deterministic.
- Provide scenario, timing, play/pause or stop, retry, and reset controls with accessible status output.
- Support direct navigation to named `/simulate/*` scenarios.

## Approach

- Current context: implementation and verification are complete; all seven scenarios work on desktop and mobile with no provider calls, console errors, accessibility violations, or test/build failures.
- Build typed scenario definitions and a clock-driven simulator that emits deterministic normalized events and attempt transitions.
- Render those events in a dedicated simulation shell using production visual conventions and explicit diagnostic state.
- Wire route fallback and add focused unit tests before browser verification through the managed development services.

## Tasks

- [x] 1. Implement typed deterministic scenarios and simulator state for streaming, thinking/tools, retry-success, retry-exhausted, terminal error, unexpected end, and cancellation.
- [x] 2. Implement the `/simulate` UI shell and route wiring, including scenario controls, transcript rendering, attempt/status diagnostics, retry/stop/reset behavior, and direct-route fallback.
- [x] 3. Add focused tests for scenario resolution, simulator sequencing and retry behavior, and server route fallback.
- [x] 4. Run repository verification and browser-test `/simulate` scenarios on desktop and mobile using managed services.

## Paths

- `src/ui/simulate/`
- `src/ui/UiRouter.tsx`
- `src/app/appKnownRouteResolve.ts`
- `test/`
- `src/ui/styles.css`
