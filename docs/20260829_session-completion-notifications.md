# Session completion notifications

## Goal

Add an optional completion sound and a persistent blue unread marker for background sessions that finish successfully, with notification behavior covered by focused unit, integration, and browser tests.

## Decisions

- Observe the existing shared event-feed coordinator; do not create another `EventSource`.
- Notify only for a new `run-completed` event belonging to an unselected session. Failed, cancelled, interrupted, stale, bootstrap, and replayed events do not produce the success sound or blue marker.
- Deduplicate by stable completion identity and mark a session read when it is opened.
- Persist unread completion identities and the sound preference in `localStorage`; keep notification state local to each browser profile.
- Default completion sound to enabled, tolerate browser autoplay rejection, and never allow playback failure to affect event processing.
- Commit one original or license-compatible short MP3 under `public/audio/`; its expected size is negligible and a tracked asset keeps clean checkouts and deployments reproducible.
- Render a small tokenized `bg-accent` dot rather than modifying the read-only `ui/` copy.
- Use `~/opensource/opencode` as the local reference implementation. Port behavior into Codeline's architecture rather than copying its notification context wholesale.
- Port the applicable OpenCode TUI notification guarantees: real transition only, duplicate suppression, success-after-error suppression by event classification, independent enablement, lazy playback, and non-throwing playback failure. Add web unread/viewed-state coverage that OpenCode itself currently lacks.

## Approach

- Isolate completion classification, deduplication, unread persistence, and audio policy from Solid views so notification behavior is deterministic under unit tests.
- Map each applicable case from OpenCode's `packages/tui/test/cli/cmd/tui/notifications.test.ts` and `packages/opencode/test/cli/cmd/tui/attention.test.ts` to a named Codeline test; document intentional omissions for unsupported concepts such as permissions, questions, subagents, and native TUI notifications.
- Follow OpenCode's web behavior in `packages/app/src/context/notification.tsx`, `packages/app/src/utils/sound.ts`, and `packages/app/src/pages/layout/sidebar-items.tsx` for event handling, lazy browser audio, unseen state, and marker presentation while adding the dedicated tests absent from that web implementation.
- Compose those modules at `eventFeedCoordinatorStateCreate` and the selected-session state, preserving the existing authoritative snapshot and reconnect behavior.
- Project unread state into session rows and expose the audio preference on the settings page.
- Verify the real composition with fake SSE tests, then verify marker, navigation, persistence, and playback calls through the repository-managed combined preview service.

## Tasks

- [ ] 1. Create an explicit OpenCode-to-Codeline behavior mapping from the two OpenCode notification test files, then add completion-event classification and deduplication with tests for successful background completions, selected sessions, all non-success terminal events, stale sources, bootstrap/history, duplicate cursors/identities, reconnect replay, and every applicable mapped OpenCode case.
- [ ] 2. Add local unread state and persistence with tests for independent sessions, one marker per completion identity, reload restoration, malformed storage recovery, selection-based clearing, and no marker from unrelated events.
- [ ] 3. Add the sound preference, committed audio asset, and injectable player/policy with tests for enabled and disabled states, lazy asset creation, one playback attempt per completion, autoplay rejection, unavailable browser APIs, and non-throwing cleanup.
- [ ] 4. Integrate notifications with the existing event-feed coordinator and selection flow, with composition tests proving one sound/unread transition, no replay after reconnect, no late event from a superseded source, no bootstrap phantom notification, and safe disposal.
- [ ] 5. Project unread state into the session list and render an accessible blue marker; add focused state/view tests for the correct row, list reordering and refresh, selected-session clearing, keyboard navigation, and unchanged loading/error/empty states.
- [ ] 6. Add the completion-sound control to Settings using existing local preference conventions; test preference initialization, toggling, persistence, and accessible switch semantics.
- [ ] 7. Add managed-preview browser coverage for background completion, marker clearing by mouse and keyboard navigation, reload persistence, one observed audio call, blocked playback, and reconnect deduplication; run focused tests, full unit/integration tests at concurrency 1, typecheck, formatting checks, and the combined-preview E2E test.

## Paths

- `~/opensource/opencode/packages/app/src/context/notification.tsx`
- `~/opensource/opencode/packages/app/src/utils/sound.ts`
- `~/opensource/opencode/packages/app/src/pages/layout/sidebar-items.tsx`
- `~/opensource/opencode/packages/tui/src/feature-plugins/system/notifications.ts`
- `~/opensource/opencode/packages/tui/src/attention.ts`
- `~/opensource/opencode/packages/tui/test/cli/cmd/tui/notifications.test.ts`
- `~/opensource/opencode/packages/opencode/test/cli/cmd/tui/attention.test.ts`
- `public/audio/completion.mp3`
- `src/notifications/completionNotificationEventResolve.ts`
- `src/notifications/completionNotificationIdentityCreate.ts`
- `src/notifications/sessionUnreadStateCreate.ts`
- `src/notifications/completionAudioPreferenceStateCreate.ts`
- `src/notifications/completionAudioPlayerCreate.ts`
- `src/notifications/notificationCoordinatorStateCreate.ts`
- `src/ui/eventFeedCoordinatorStateCreate.ts`
- `src/ui/sessionListStateCreate.ts`
- `src/ui/SessionList.tsx`
- `src/ui/settingsRoutePageStateCreate.ts`
- `src/ui/SettingsRoutePage.tsx`
- `test/completionNotificationEventResolve.test.ts`
- `test/sessionUnreadStateCreate.test.ts`
- `test/completionAudioPlayerCreate.test.ts`
- `test/notificationCoordinatorStateCreate.test.ts`
- `test/notificationEventFeedIntegration.test.ts`
- `test/sessionListNotificationsIntegration.test.ts`
- `test/settingsRoutePageStateCreate.test.ts`
- `e2e/completionNotifications.spec.ts`
