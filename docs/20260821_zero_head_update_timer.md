# Goal

Keep Codeline pinned to the latest immutable official `@rocicorp/zero` head package without relying on generated output in the updater-managed Zero checkout.

# Decisions

- Resolve the moving official npm head release, but persist its exact immutable version in `package.json`.
- Keep the updater command in Codeline and deploy its user units through `~/leo/david-server/linux_timers`.
- Store the user timer configuration in `~/leo/david-server` so that repository remains the machine-configuration source of truth.
- Change files and run `bun install` only when the resolved version changes.
- Do not publish a custom Zero package.

# Approach

- Current context: Codeline pins official head package `1.10.0-head-9f1e077b-20260821`; `scripts/zeroHeadUpdate.ts` resolves the npm `head` tag and skips installation when unchanged. `~/leo/david-server/linux_timers` owns the daily 03:00 local-time user units, which are installed and active locally.
- Reuse existing service installation and scripting conventions.
- Make the updater deterministic, failure-safe, and independently runnable.

# Tasks

- [x] 1. Inspect existing `ops/` user-unit conventions and Zero link/setup integration.
- [x] 2. Implement the Zero npm-head update script and exact dependency migration.
- [x] 3. Add and wire the managed systemd user service and timer.
- [x] 4. Integrate the timer configuration and deployment with `~/leo/david-server`.
- [x] 5. Verify script behavior, unit syntax, deployment workflow, and project checks.

# Paths

- `package.json`
- `scripts/zeroHeadUpdate.ts`
- `ops/dev/codeline-dev.sh`
- `ops/dev/zero-link.sh`
- `release-inputs.json`
- `src/release/releaseInputsVerify.ts`
- `README.md`
- `ops/`
- `~/leo/david-server`
- `docs/20260821_zero_head_update_timer.md`
