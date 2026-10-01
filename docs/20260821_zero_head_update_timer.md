# Goal

Keep Codeline pinned to the latest immutable official `@rocicorp/zero` head package without relying on generated output in the updater-managed Zero checkout.

# Decisions

- Resolve the moving official npm head release, but persist its exact immutable version in `package.json`.
- The updater command originally lived in Codeline, and its user units were deployed through the former david-server timer configuration.
- Current user timer configuration lives in `/home/david/leo_internal/dev-servers/david-server/timers`, a host-owned subdirectory of the consolidated repository; the former `dev_update` job is retired and not present there, with no equivalent in the consolidated repository.
- Change files and run `bun install` only when the resolved version changes.
- Do not publish a custom Zero package.

# Approach

- Historical implementation context: Codeline pinned official head package `1.10.0-head-9f1e077b-20260821`; the former zeroHeadUpdate.ts script resolved the npm `head` tag and skipped installation when unchanged. The former david-server linux_timers configuration owned daily 03:00 local-time user units, verified as installed and active at that time. The script is now absent from Codeline.
- Reuse existing service installation and scripting conventions.
- Make the updater deterministic, failure-safe, and independently runnable.

# Tasks

- [x] 1. Inspect existing `ops/` user-unit conventions and Zero link/setup integration.
- [x] 2. Implement the Zero npm-head update script and exact dependency migration.
- [x] 3. Add and wire the managed systemd user service and timer.
- [x] 4. Integrate the timer configuration and deployment with the former david-server repository.
- [x] 5. Verify script behavior, unit syntax, deployment workflow, and project checks.

# Paths

- `package.json`
- Historical updater: zeroHeadUpdate.ts (formerly under scripts; now absent).
- `ops/dev/codeline-dev.sh`
- `ops/dev/zero-link.sh`
- `release-inputs.json`
- `src/release/releaseInputsVerify.ts`
- `README.md`
- `ops/`
- `/home/david/leo_internal/dev-servers/david-server/timers` (current timer configuration; no replacement for the retired `dev_update` job).
- `docs/20260821_zero_head_update_timer.md`
