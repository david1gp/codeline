# HTTP + SSE cutover matrix

This is the task 1 inventory for `docs/20260822_http_sse_migration_plan.md`.
SQLite/libSQL with Drizzle, typed HTTP, and the authenticated global-summary and selected-session-detail
SSE streams are the current runtime. Legacy Zero/Convex paths remain listed only as cleanup
references; they are not active authorities.

## Cutover matrix

| Surface | Implementation / cleanup reference | Current authority / transport | Target | Cutover |
| --- | --- | --- | --- | --- |
| Legacy Zero transport | historical `src/ui/CodelineZeroProvider.tsx`, `src/ui/codelineQueries.ts`, `src/note/noteMutators.ts`, `src/database/zeroSchema.ts`, and compatibility routes | Not active; retained only to explain the completed cleanup | Typed JSON HTTP reads/mutations, global-summary `/api/events`, and selected-session-detail `/api/sessions/:sessionId/events` | 3, 7, 13, 18 |
| Legacy Convex runtime | historical `src/server/serverStart.ts`, `src/app/appCreate.ts`, `src/api/apiRoutesAdd.ts`, `src/convex/*`, and `convex/*` references | Not active; no Convex client/function is a current authority | Hono owns the API and execution; SQLite/libSQL with Drizzle is the only durable store | 8–13, 18 |
| SQL / Drizzle persistence | `drizzle.config.ts`, `src/database/{databaseClient,databaseCreate,databaseTransactionRun,databaseReadyCheck}.ts`; domain `db/` modules under `identity`, `agents`, `servers`, `session`, `message`, `run`, `journal`, and `note` | SQLite/libSQL Drizzle persistence is authoritative for the managed API | SQLite/libSQL with Drizzle is the sole durable authority, with transactional revisions, idempotency, journal counters, and journal rows | 2, 4–6, 8–12 |
| HTTP composition | `src/api/apiRoutesAdd.ts`, `src/app/appCreate.ts`, `src/api/apiRequestParse.ts` | Hono `/api` boundary; Valibot request parsing and `Result` error handling | Keep Hono; standardize shared contracts, conditional caching, preconditions, and typed client use | 3–4 |
| Authentication | `src/identity/api/authenticationMiddleware.ts`, `src/identity/api/apiAuthRoutesAdd.ts`, cookie helpers, `src/identity/actions/*`, `src/identity/db/*`, `src/identity/oidc/*` | SQLite/libSQL Drizzle sessions plus OIDC/development identity | Retain SQLite/libSQL Drizzle auth and same-origin session cookies for HTTP and SSE; authorization remains per request identity | 8–13 |
| Sessions | `src/session/api/apiSessionRoutesAdd.ts`, `src/session/api/apiSessionRenameRoutesAdd.ts`, `src/session/api/apiSessionBranchRoutesAdd.ts`; `src/session/actions/*`; `src/session/db/sessionRepositoryBoundedSnapshot.ts`, `src/session/db/sessionRepositoryBoundedHistoryPage.ts` | SQLite/libSQL Drizzle repositories behind typed HTTP | SQLite/libSQL Drizzle typed HTTP; keyset list, shell/list bootstrap, and bounded projected snapshot/history endpoints, with account-scoped client cache | 8, 13–15 |
| Messages | `src/api/apiRoutesAdd.ts` mounts `src/message/api/apiMessageRoutesAdd.ts`; `src/message/actions/*`, `src/message/db/*` | SQLite/libSQL Drizzle repositories behind typed HTTP | SQLite/libSQL Drizzle typed HTTP; canonical message records feed the bounded session-history projection | 8, 13 |
| Runs / execution | `src/run/api/apiRunRoutesAdd.ts`, `src/run/actions/*`, `src/run/db/*`, `src/session/actions/sessionChatPrepare.ts`, `src/session/actions/sessionChatStreamCreate.ts`, `src/session/api/apiSessionRoutesAdd.ts` | SQLite/libSQL persistence with the process-owned execution lifecycle | Process-owned run registry; disconnect/reload does not cancel; active-run snapshots and startup interruption checkpoints | 9–11 |
| Provider chat start | `src/session/api/apiSessionRoutesAdd.ts`, `src/session/actions/{sessionChatPrepare,sessionChatStreamCreate}.ts`, `src/run/actions/{runActiveRegistryCreate,runProviderOutputCreate}.ts`, provider adapters in `src/providers/runtime/*` | `POST /api/sessions/:sessionId/chat` is a detached JSON command start; the process-owned registry owns execution and browser disconnect/reload does not cancel it | Prompt command over HTTP plus journal-backed global-summary/selected-session-detail streams | 9–10 |
| SSE feeds | `src/events/api/apiEventsRoutesAdd.ts`, `src/journal/actions/journalGlobalSummaryBacklogRead.ts`, `src/session/api/apiSessionDetailEventsRoutesAdd.ts`, `src/session/actions/sessionDetailStreamBacklogRead.ts`, `src/stream/actions/streamLiveSubscriptionCreate.ts` | Authenticated same-origin global-summary and selected-session-detail streams backed by the SQLite/libSQL journal | Global `/api/events` and selected-session `/api/sessions/:sessionId/events`, with separate opaque cursors, backlog, reconnect, and reconciliation | 5–7, 10–11 |
| Journal persistence | `src/journal/db/{journalEventTable,journalSequenceCounterTable,journalReplayBoundaryTable}.ts`, `src/journal/actions/{journalWriteCreate,journalEventsAppendPersist,journalEventsPruneSchedulerCreate}.ts` | Per-application-user SQLite/libSQL journal and sequence counter; active transient deltas may be replayable before terminal compaction/deletion | Persist journal events before post-commit publication; compact terminal events; opportunistically enforce age/count/serialized-byte limits after writes | 5–6, 10 |
| UI reads | `src/session/client/{sessionBoundedHistoryStateCreate,sessionDetailStateCreate}.ts`, `src/session/storage/*`, `src/ui/*StateCreate.ts`, note/project/provider/server/agent state modules | Typed HTTP reads with in-memory resource cache | Fetch-backed state, bounded projected IndexedDB snapshot/entry/page cache, separately cached finalized details, and an application-user/account-scoped child-history cache | 3, 7, 13–15 |
| UI mutations | `src/ui/*`, `src/note/ui/*`, `src/run/client/runCancelCommand.ts` | Typed HTTP commands | Only prompt submission is optimistic; idempotency and `If-Match` where required | 3–4, 8–13 |
| Subscriptions | `src/ui/eventFeed*`, `src/events/api/apiEventsRoutesAdd.ts`, `src/session/api/apiSessionDetailEventsRoutesAdd.ts` | Authenticated global-summary feed per tab plus selected-session-detail feed when a session is selected | Separate global and selected-detail streams with reconnect, cursor, and reconciliation states | 7, 13 |
| Servers / agents | `src/api/apiRoutesAdd.ts` mounts `src/servers/api/apiServerRoutesAdd.ts` and `src/agents/api/apiAgentRoutesAdd.ts`; `src/servers/actions/*`, `src/agents/actions/*`, corresponding `db/` modules | SQLite/libSQL Drizzle repositories behind typed HTTP | SQLite/libSQL Drizzle typed HTTP | 12–13 |
| Notes | `src/note/api/*`, `src/note/actions/*`, `src/note/db/*`, `src/note/ui/*` | SQLite/libSQL Drizzle repositories behind typed HTTP | SQLite/libSQL Drizzle typed HTTP mutation families; no dual writes | 12–13 |
| Retained HTTP domains | `src/project/api/*`, `src/providers/api/*`, `src/api/health/*`, `src/api/readiness/*`, `src/api/testing/*` | Hono JSON HTTP; testing stream is test-only, not the production feed | Keep HTTP; apply shared boundary conventions as appropriate | 3–4, 19 |

## Legacy path inventory

The paths in this section are historical implementation names from the migration inventory. They are not current implementation paths, services, clients, or data authorities; current operations are limited to the SQLite/libSQL API/UI stack documented above. Empty legacy directories are not runtime dependencies.

### Zero (historical cleanup references)

- Provider and schema: `src/ui/CodelineZeroProvider.tsx`,
  `src/database/zeroSchema.ts`, and `src/ui/codelineQueries.ts`.
- Server compatibility routes: `src/api/query/apiQueryRoutesAdd.ts` and
  `src/api/mutation/apiMutationRoutesAdd.ts`.
- Query consumers: `sessionListStateCreate.ts`, `selectedSessionStateCreate.ts`,
  `sessionStreamStateCreate.ts`, `sessionSearchStateCreate.ts`,
  `simulate/simulateInspectorStateCreate.ts`, `protectedShellStateCreate.ts`,
  `zeroConnectionIndicatorStateCreate.ts`, and `appShellStateCreate.ts`.
- Query definitions: `activeSession`, `activeSessions`, `activeRuns`,
  `finalizedMessages`, `latestSessionRun`, `sessionRuns`, `sessionDelegations`,
  `note`, `sessionStreamEvents`, and `notes`.
- Mutation definitions: `src/note/noteMutators.ts` (`create`, `update`, `delete`,
  and `reorder`); logout also deletes the Zero cache in
  `src/identity/ui/authLogoutStateCreate.ts`.

### Convex (historical cleanup references)

- Construction and injection: `src/server/serverStart.ts`, `src/app/appCreate.ts`,
  `src/api/apiRoutesAdd.ts`, and `src/api/appEnvironment.ts`.
- Browser provider/wrappers: `src/convex/CodelineConvexProvider.tsx`,
  `codelineConvexProviderStateCreate.ts`, `convexClientCreate.ts`,
  `codelineConvexQueryCreate.ts`, and `codelineConvexMutationCreate.ts`.
- Domain clients: `src/convex/serverAgentConvexClient.ts`,
  `serverAgentConvexClientCreate.ts`, `sessionNoteConvexClient.ts`,
  `sessionNoteConvexClientCreate.ts`, `executionConvexClient.ts`, and
  `src/identity/convex/identityClient.ts` plus its factory.
- Function modules: `convex/{identity,sessions,messages,runs,streams,servers,agents,notes}.ts`,
  `convex/schema.ts`, `convex/http.ts`, and bounded-context `src/*/convex/*` modules.
- No current runtime path selects these clients; these references document the
  removed migration path only.

### SQL / Drizzle (current runtime)

- Connection and transaction path: `src/database/databaseClient.ts`,
  `databaseCreate.ts`, `databaseTransactionRun.ts`, `databaseReadyCheck.ts`,
  `databaseSchema.ts`, and `drizzle.config.ts`.
- Identity: all current tables/repositories in `src/identity/db/*`, including
  application users, organizations, members, external identities, login
  transactions, and identity sessions; actions in `src/identity/actions/*` use
  these repositories for the current authenticated HTTP/SSE runtime.
- Domain persistence: `src/agents/db/*`, `src/servers/db/*`,
  `src/session/db/*`, `src/message/db/*`, `src/run/db/*`,
  `src/journal/db/*`, and `src/note/db/noteTable.ts`.
- Seed and operational callers: `scripts/dbSeed.ts`,
  `scripts/e2eOrganizationMemberSessionsIssue.ts`,
  `scripts/e2eOrganizationMemberSessionsPurge.ts`, and the `db:*` scripts in
  `package.json`.

### HTTP route inventory

- Composition and boundary: `src/api/apiRoutesAdd.ts`, `src/app/appCreate.ts`,
  `src/api/apiRequestParse.ts`; `/api/health`, `/api/ready`, and static shell
  routes are in `src/app/appCreate.ts` / `src/api/*`.
- Authentication: `/api/auth/login`, `/api/auth/callback`,
  `/api/auth/session`, and `/api/auth/logout` in
  `src/identity/api/apiAuthRoutesAdd.ts`.
- Sessions: `GET/POST /api/sessions`, `GET /api/sessions/:sessionId`,
  `POST /api/sessions/:sessionId/chat`, pin/archive/delete routes in
  `apiSessionRoutesAdd.ts`, and rename/branch routes in the sibling modules.
- Messages: `/api/sessions/:sessionId/messages` in
  `src/message/api/apiMessageRoutesAdd.ts`.
- Runs: `/api/sessions/:sessionId/runs/:runId/cancel` and related run routes in
  `src/run/api/apiRunRoutesAdd.ts`.
- Streams: global `/api/events` in `src/events/api/apiEventsRoutesAdd.ts` and
  selected-session `/api/sessions/:sessionId/events` in
  `src/session/api/apiSessionDetailEventsRoutesAdd.ts`.
- Servers and agents: `/api/servers*` and `/api/agents*` in their bounded
  contexts.
- Projects and providers: `/api/projects*` / project file routes and
  `/api/providers/*` in `src/project/api/*` and `src/providers/api/*`.
- Testing: `/api/testing/*`. The former `/api/query` and `/api/mutate` compatibility routes were removed.

`src/session/api/apiSessionBranchRoutesAdd.ts` is mounted by `src/api/apiRoutesAdd.ts`
when the configured database and journal dependencies are available.

### Authentication and authorization

- Request middleware: `src/identity/api/authenticationMiddleware.ts` reads the
  session cookie, resolves development or OIDC identity, loads organization
  membership, and sets `context.var.requestIdentity`.
- Cookie boundary: `identitySessionCookieRead.ts`, `Set.ts`, `Clear.ts`, and
  OIDC browser-binding cookie helpers.
- Durable identity actions/repositories: `identitySessionLoad.ts`,
  `identitySessionCreate.ts`, `identitySessionRevoke.ts`,
  `organizationMemberLoad.ts`, and the identity `db/` modules.
- Authorization is handled by the SQLite/libSQL Drizzle repositories and
  request identity; no Convex client is selected.

### UI reads, mutations, subscriptions, and streams

- Session read state uses typed HTTP and event-feed reconciliation through
  `sessionListStateCreate.ts`, `selectedSessionStateCreate.ts`, and
  `sessionSearchStateCreate.ts`.
- Message HTTP reads and writes use the SQLite/libSQL Drizzle repositories
  mounted by `apiRoutesAdd.ts`.
- Server and agent HTTP reads/writes use their SQLite/libSQL Drizzle
  repositories mounted by `apiRoutesAdd.ts`.
- Stream read state: `src/events/client/eventFeedCreate.ts`,
  `src/session/client/sessionDetailStateCreate.ts`,
  `src/session/client/sessionDetailSource.ts`, and the shared SSE adapters in
  `src/stream/client/`.
- Note read/mutation state: all `src/note/ui/*StateCreate.ts` modules use the
  typed HTTP note client and SQLite/libSQL repositories.
- Session/run mutation state: `chatComposerStateCreate.ts`, session sidebar
  action state, `sessionPinToggleStateCreate.ts`, rename controls, and
  `run/client/runCancelCommand.ts`.
- Current subscriptions use an authenticated global-summary `EventSource` per tab at `/api/events`, plus a
  selected-session-detail `EventSource` at `/api/sessions/:sessionId/events` while a session is selected;
  the UI reconciles each stream independently.
- Current journal producers are `src/run/actions/runProviderOutputCreate.ts`,
  `src/journal/actions/journalWriteCreate.ts`, and
  `src/journal/actions/journalEventsAppendPersist.ts`; selected-session detail
  publication uses `src/session/actions/sessionDetailPostCommitPublishCreate.ts`.
  Global journal events are scoped and sequenced per application user; selected
  detail cursors use session-local `changePosition` and immutable entry `position`.

## Contract decisions recorded in task 1

The following Valibot schemas are shared boundary contracts. They are additive;
they do not add routes, clients, persistence, or migration behavior.

| Contract | Schema | Decision |
| --- | --- | --- |
| Public IDs / cursors | `src/api/schema/apiPublicIdSchema.ts`, `apiCursorSchema.ts` | Public IDs are trimmed, bounded, and newline-free. Cursors are opaque, bounded, and not decoded by clients. |
| Representation metadata | `src/api/schema/apiRepresentationMetadataSchema.ts` plus revision, sequence, and ETag schemas | Resource responses that implement representation metadata carry their schema version, revision, and strong quoted ETag; bounded session snapshots use their own projected contract. |
| Session shell/list | `src/session/api/sessionShellSchema.ts`, `sessionListSnapshotResponseSchema.ts` | Bootstrap/list is a validated keyset response containing `nextCursor`, session shells, and `asOfCursor`; the bounded session snapshot is a separate endpoint. |
| Bounded session history | `src/session/api/sessionBoundedSnapshotSchema.ts`, `src/session/api/sessionBoundedHistoryPageSchema.ts`, `src/session/storage/sessionCacheSnapshotReplace.ts` | `GET /api/sessions/:sessionId/bounded-snapshot` returns up to 25 projected steps with fixed `throughPosition` and opaque cursors; IndexedDB atomically replaces snapshot/entries/pages while finalized run/tool details are cached separately. |
| Message page | `src/message/api/messageApiRecordSchema.ts`, `messagePageResponseSchema.ts` | Pages use `nextCursor`; message ordering is represented by positive `sequence`, not offsets. |
| Active run | `src/run/api/runActiveSnapshotResponseSchema.ts`, `src/run/api/runActiveDetailSchema.ts` | Partial text and the last available journal sequence are explicit. |
| Preconditions | `src/api/errors/apiPreconditionFailedResponseSchema.ts`, `src/api/errors/apiErrorResponseSchema.ts` | A stale edit/delete is a structured `412` with current revision/ETag when available; the precondition response is a member of the shared API error contract, not a generic `409`. |
| Idempotency | `src/api/schema/apiIdempotencyKeySchema.ts`, `apiIdempotencyRequestSchema.ts`, `apiIdempotencyResultSchema.ts`, `apiIdempotencyResultSchemaCreate.ts` | The client key is bounded and newline-free; normalized results distinguish a fresh result from a replay. The generic envelope does not validate `responseBody`; every operation must validate it with its operation-specific response schema through `apiIdempotencyResultSchemaCreate` before storing or replaying it. |
| Journal cursor/event | `src/journal/schema/journalCursorSchema.ts`, `src/stream/schema/journalEventIdSchema.ts`, `journalEventSchema.ts` | IDs/cursors are opaque same-user values. The server, not the client schema, enforces journal ownership and recoverability. |
| SSE frame | `src/stream/api/globalSummarySseFrameSchema.ts`, `src/session/api/sessionDetailSseFrameSchema.ts`, `src/stream/actions/streamSseConnectionWriterCreate.ts` | One named JSON event per frame; each validator and the writer enforce matching frame ID/type and a complete serialized UTF-8 frame (`id`, `event`, `data`, and terminator) capped at 128 KiB before compression. |
| Active-run reconciliation | `src/run/api/runActiveSnapshotResponseSchema.ts`, `src/run/api/runActiveDetailSchema.ts` | Terminal `succeeded`, `failed`, and `aborted` statuses are intentionally accepted in these active-run schemas because reconciliation can observe a run completing between reads. A terminal status triggers authoritative reconciliation; it does not mean the run is still active. |
| UI reconciliation state | `src/ui/uiDataLayerStatusSchema.ts` | `connected`, `reconnecting`, `reconciling`, `offline`, and `stale` are explicit states rather than inferred booleans. |

## Completion status and exclusions

- The HTTP/SSE and bounded session-history cutovers are complete; Zero and
  Convex are historical migration inputs, not active authorities.
- The per-user journal, sequence counter, publication path, `/api/events`, selected-session detail events,
  and typed HTTP client are current runtime components.
- Global journal cursors are per application user; selected-session detail
  cursors are session-local `changePosition` values and are not interchangeable.
- Provider execution is detached from HTTP requests and SSE connections and is owned by
  the process-wide `runActiveRegistry`; the chat start returns JSON immediately.
- Existing API responses are mostly unversioned and do not consistently expose
  revisions or ETags.
- This matrix is a current-runtime inventory plus historical cleanup record;
  completed behavior is tracked in the migration plan without treating legacy
  systems as active operations.
