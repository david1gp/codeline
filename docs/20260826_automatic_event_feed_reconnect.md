# Automatic event-feed reconnect

## Goal

Restore an editable signed-in session automatically after a temporary connection loss, show an accessible reconnecting indicator, and cover the outage-to-recovery flow with deterministic tests.

## Decisions

- Keep the existing browser `EventSource` retry behavior and retained event cursor.
- On browser connectivity recovery, reopen the feed and revalidate the registered HTTP/session state that controls read-only mode.
- Reuse the existing connection status state and indicator instead of adding a second status model.
- Extend the existing offline browsing E2E scenario with recovery assertions using Playwright context connectivity control.
- Adapt the state-transition and single-live-connection assertions used by the local `opencode`, `pi-web`, and `deepseek-harness` reconnect tests.

## Approach

- Add an application-level online recovery operation that coordinates feed reopening and query/cache reconciliation.
- Mount the existing connection indicator in the signed-in app header so `reconnecting` is visible without opening another control.
- Verify focused state behavior, feed lifecycle, accessibility, and full read-only recovery through the managed preview service.

## Tasks

- [x] 1. Implement online recovery coordination and focused unit coverage.
- [ ] 2. Surface the existing reconnecting indicator in the signed-in app header with focused UI coverage.
- [ ] 3. Extend the offline browsing E2E test to prove automatic recovery without page refresh.
- [ ] 4. Run focused tests and verify the combined managed preview flow in a browser.

## Paths

- `src/events/client/eventFeedCreate.ts`
- `src/ui/eventFeedCoordinatorStateCreate.ts`
- `src/ui/signedInApplicationStateCreate.ts`
- `src/ui/App.tsx`
- `src/ui/ConnectionStatusIndicator.tsx`
- `test/eventFeedCreate.test.ts`
- `test/eventFeedConnectionIndicatorStateCreate.test.ts`
- `e2e/settledSessionOfflineBrowsing.spec.ts`
