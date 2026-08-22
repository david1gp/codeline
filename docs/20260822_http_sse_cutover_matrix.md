# HTTP + SSE cutover matrix

This is the task 1 inventory for `docs/20260822_http_sse_migration_plan.md`. It
describes active production paths as they exist before the cutover. Generated
Convex output and tests are listed only where they affect runtime wiring.

## Cutover matrix

| Surface | Active implementation | Current authority / transport | Target | Cutover |
| --- | --- | --- | --- | --- |
| Zero transport | `src/ui/CodelineZeroProvider.tsx`, `src/ui/codelineQueries.ts`, `src/note/noteMutators.ts`, `src/database/zeroSchema.ts`; `src/api/query/apiQueryRoutesAdd.ts` (`POST /api/query`) and `src/api/mutation/apiMutationRoutesAdd.ts` (`POST /api/mutate`) | Browser Zero sync and Zero server handlers backed by Drizzle/Convex compatibility paths | Remove Zero; typed JSON HTTP reads/mutations and one per-tab `/api/events` feed | 3, 7, 13, 18 |
| Convex runtime | `src/server/serverStart.ts`, `src/app/appCreate.ts`, `src/api/apiRoutesAdd.ts`; `src/convex/*`; `convex/*` | Self-hosted Convex clients/functions are selected when `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` exist | Hono owns the API and execution; PostgreSQL/Drizzle is the only durable store | 8–13, 18 |
| PostgreSQL / Drizzle | `drizzle.config.ts`, `src/database/{databaseClient,databaseCreate,databaseTransactionRun,databaseReadyCheck}.ts`; domain `db/` modules under `identity`, `agents`, `servers`, `session`, `message`, `run`, `stream`, and `note` | Active identity persistence and selected fallback routes; domain authority is split with Convex | Sole durable authority, with transactional revisions, idempotency, journal counters, and journal rows | 2, 4–6, 8–12 |
| HTTP composition | `src/api/apiRoutesAdd.ts`, `src/app/appCreate.ts`, `src/api/apiRequestParse.ts` | Hono `/api` boundary; Valibot request parsing and `Result` error handling | Keep Hono; standardize shared contracts, conditional caching, preconditions, and typed client use | 3–4 |
| Authentication | `src/identity/api/authenticationMiddleware.ts`, `src/identity/api/apiAuthRoutesAdd.ts`, cookie helpers, `src/identity/actions/*`, `src/identity/db/*`, `src/identity/oidc/*` | Drizzle-backed sessions plus OIDC/development identity; Convex identity glue is used when injected | Retain Drizzle auth and same-origin session cookies for HTTP and SSE; authorization remains per request identity | 8–13 |
| Sessions | `src/session/api/apiSessionRoutesAdd.ts`, `apiSessionRenameRoutesAdd.ts`; `src/session/actions/*`; `src/session/db/*`; `src/session/convex/*` | List/load/mutations choose Convex when `sessionNoteConvexClient` is present, otherwise Drizzle | Drizzle typed HTTP; keyset list, shell/list bootstrap, complete settled snapshot, revisions and ETags | 8, 13–15 |
| Messages | `src/api/apiRoutesAdd.ts` mounts `src/message/api/apiMessageRoutesAdd.ts`; `src/message/actions/*`, `src/message/db/*`, `src/message/convex/*` | The mounted message routes require `executionConvexClient`; without it they return `500`. Their Drizzle repositories are not an active HTTP fallback. | Drizzle typed HTTP; sequence-keyset pages and complete settled snapshots | 8, 13 |
| Runs / execution | `src/run/api/apiRunRoutesAdd.ts`, `src/run/actions/*`, `src/run/db/*`, `src/session/actions/sessionChatPrepare.ts`, `sessionChatStreamCreate.ts`, `apiSessionRoutesAdd.ts`, `convex/runs.ts` | Convex lifecycle and request-bound provider execution; cancellation coordinator is in-process | Process-owned run registry; disconnect/reload does not cancel; active-run snapshots and startup interruption checkpoints | 9–11 |
| Provider chat SSE | `src/session/actions/sessionChatSseStreamCreate.ts`; `POST /api/sessions/:sessionId/chat` in `src/session/api/apiSessionRoutesAdd.ts`; provider adapters in `src/providers/runtime/*` | Request-associated provider stream; browser receives response-bound SSE | Prompt command over HTTP plus detached execution and journal-backed `/api/events` | 9–10 |
| Replay SSE | `src/stream/api/apiStreamRoutesAdd.ts`; `src/stream/actions/streamReplay*`; `src/stream/client/streamReplay*`; `GET /api/sessions/:sessionId/streams/:streamId/status` and `/events` | Per-session/per-stream replay via Convex or `streamEventTable` / `streamCheckpointTable` | One authenticated same-origin `EventSource` at `/api/events`, opaque same-user cursor, reset reconciliation | 5–7, 10–11 |
| Stream persistence | `src/stream/db/{streamEventTable,streamCheckpointTable,streamRepositoryAppend,streamRepositoryListAfter,streamCheckpointRepositoryAdvance,streamCheckpointRepositoryLoadOrCreate}.ts`; `src/stream/convex/*` | Per-stream sequences/checkpoints, with Convex and PostgreSQL alternatives | Per-user journal and counter; persist deltas before publish; compact terminal events; bounded retention | 5–6, 10 |
| UI reads | `src/ui/sessionListStateCreate.ts`, `selectedSessionStateCreate.ts`, `sessionStreamStateCreate.ts`, `sessionSearchStateCreate.ts`, `simulate/simulateInspectorStateCreate.ts`; note UI; project/provider/server/agent state modules | Zero queries, Convex reactive queries, and a few direct fetch reads | Fetch-backed state, revision/ETag cache, HTTP snapshots, and validated IndexedDB settled records | 3, 7, 13–15 |
| UI mutations | `src/ui/*`, `src/note/ui/*`, `src/run/client/runCancelCommand.ts`, `makeFunctionReference`/`codelineConvexMutationCreate` consumers | Convex mutations for sessions/notes/runs/agents/servers; direct HTTP for some commands | Typed HTTP commands; only prompt submission is optimistic; idempotency and `If-Match` where required | 3–4, 8–13 |
| Subscriptions | Zero query subscriptions from `src/ui/codelineQueries.ts`; Convex provider/query wrappers in `src/convex/*`; stream mode in `src/ui/sessionStreamStateCreate.ts` | Reactive Zero/Convex synchronization; no unified feed | One `EventSource` per tab, demultiplexed by session/run, with reconnect and reset states | 7, 13 |
| Servers / agents | `src/api/apiRoutesAdd.ts` mounts `src/servers/api/apiServerRoutesAdd.ts` and `src/agents/api/apiAgentRoutesAdd.ts`; `src/servers/actions/*`, `src/agents/actions/*`, corresponding `db/` and `convex/` modules | The mounted routes resolve `ServerAgentConvexClient` (created from the Convex deployment in `src/server/serverStart.ts`). The server list returns an empty list without an organization and otherwise returns `500` if the client is absent; agent routes return auth/organization errors before that check and `500` for a missing client. Their Drizzle modules are not an active HTTP fallback. | Drizzle typed HTTP, then remove Convex consumers | 12–13 |
| Notes | `src/note/noteMutators.ts`, `src/note/convex/*`, `src/note/db/noteTable.ts`, `src/note/ui/*` | Zero mutators and Convex queries/mutations; a Drizzle table exists | Drizzle typed HTTP mutation families; no dual writes | 12–13 |
| Retained HTTP domains | `src/project/api/*`, `src/providers/api/*`, `src/api/health/*`, `src/api/readiness/*`, `src/api/testing/*` | Hono JSON HTTP; testing stream is test-only, not the production feed | Keep HTTP; apply shared boundary conventions as appropriate | 3–4, 19 |

## Active path inventory

### Zero

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

### Convex

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
- Operational selection is environment-gated, but the session and stream routes
  explicitly prefer Convex whenever their clients are injected.

### PostgreSQL / Drizzle

- Connection and transaction path: `src/database/databaseClient.ts`,
  `databaseCreate.ts`, `databaseTransactionRun.ts`, `databaseReadyCheck.ts`,
  `databaseSchema.ts`, and `drizzle.config.ts`.
- Identity: all active tables/repositories in `src/identity/db/*`, including
  application users, organizations, members, external identities, login
  transactions, and identity sessions; actions in `src/identity/actions/*` use
  these repositories when no Convex identity client is injected.
- Domain persistence: `src/agents/db/*`, `src/servers/db/*`,
  `src/session/db/*`, `src/message/db/*`, `src/run/db/*`,
  `src/stream/db/*`, and `src/note/db/noteTable.ts`.
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
- Streams: per-stream status/events routes in `src/stream/api/apiStreamRoutesAdd.ts`.
- Servers and agents: `/api/servers*` and `/api/agents*` in their bounded
  contexts.
- Projects and providers: `/api/projects*` / project file routes and
  `/api/providers/*` in `src/project/api/*` and `src/providers/api/*`.
- Compatibility/testing: `/api/query`, `/api/mutate`, and `/api/testing/*`.

`src/session/api/apiSessionBranchRoutesAdd.ts` exists but is not mounted by
`apiRoutesAdd.ts`; it is not an active HTTP path in this inventory.

### Authentication and authorization

- Request middleware: `src/identity/api/authenticationMiddleware.ts` reads the
  session cookie, resolves development or OIDC identity, loads organization
  membership, and sets `context.var.requestIdentity`.
- Cookie boundary: `identitySessionCookieRead.ts`, `Set.ts`, `Clear.ts`, and
  OIDC browser-binding cookie helpers.
- Durable identity actions/repositories: `identitySessionLoad.ts`,
  `identitySessionCreate.ts`, `identitySessionRevoke.ts`,
  `organizationMemberLoad.ts`, and the identity `db/` modules.
- Convex authorization glue still active through `src/identity/convex/*` when
  `identityClient` is supplied. It is a blocker for final Convex removal, not a
  reason to change the authentication model in task 1.

### UI reads, mutations, subscriptions, and streams

- Session read state: `sessionListStateCreate.ts` has separate Convex and Zero
  branches; `selectedSessionStateCreate.ts` combines Zero/Convex session,
  message, delegation, and run queries; `sessionSearchStateCreate.ts` has
  Convex and Zero/fetch branches.
- Message HTTP reads and writes are mounted by `apiRoutesAdd.ts` and call only
  `executionConvexClient` in `apiMessageRoutesAdd.ts`; an absent client is an
  internal error, not a Drizzle fallback.
- Server HTTP reads and agent HTTP reads/writes are mounted by `apiRoutesAdd.ts`
  and resolve only `serverAgentConvexClient` in their route modules. The server
  and agent `db/` modules are not selected by these active HTTP paths.
- Stream read state: `sessionStreamStateCreate.ts`,
  `streamActivityStateCreate.ts`, `simulate/simulateInspectorStateCreate.ts`,
  `src/stream/client/streamReplayClientCreate.ts`, and
  `streamReplayConnectionCreate.ts`.
- Note read/mutation state: all `src/note/ui/*StateCreate.ts` modules, with
  Convex list/query/mutation wrappers in `notesPageStateCreate.ts`,
  `notePageStateCreate.ts`, `newNotePageStateCreate.ts`, and
  `noteWorkspacePageStateCreate.ts`.
- Session/run mutation state: `chatComposerStateCreate.ts`, session sidebar
  action state, `sessionPinToggleStateCreate.ts`, rename controls, and
  `run/client/runCancelCommand.ts`.
- Current subscriptions are Zero `useQuery` calls and Convex query wrappers;
  no `EventSource` or `/api/events` implementation exists.
- Current stream producers are `sessionChatStreamCreate.ts`, provider runtime
  adapters, `stream/actions/streamAppend.ts`, and replay services. Current
  stream rows are keyed by `(streamId, sequence)`, not application user.

## Contract decisions recorded in task 1

The following Valibot schemas are shared boundary contracts. They are additive;
they do not add routes, clients, persistence, or migration behavior.

| Contract | Schema | Decision |
| --- | --- | --- |
| Public IDs / cursors | `src/api/schema/apiPublicIdSchema.ts`, `apiCursorSchema.ts` | Public IDs are trimmed, bounded, and newline-free. Cursors are opaque, bounded, and not decoded by clients. |
| Representation metadata | `src/api/schema/apiRepresentationMetadataSchema.ts` plus revision, sequence, and ETag schemas | Cacheable responses carry `schemaVersion`, non-negative integer `revision`, strong quoted `etag`, and `asOfSequence`. |
| Session shell/list | `src/session/api/sessionShellSchema.ts`, `sessionListSnapshotResponseSchema.ts` | Bootstrap/list is one validated representation containing keyset `nextCursor`, session shells, active-run summaries, and `asOfSequence`. |
| Settled session | `src/session/api/sessionSnapshotPayloadSchema.ts`, `sessionSnapshotResponseSchema.ts`, `src/session/schema/sessionSettledRecordSchema.ts` | The authoritative settled payload is complete and is the only payload eligible for the future IndexedDB record. |
| Message page | `src/message/api/messageApiRecordSchema.ts`, `messagePageResponseSchema.ts` | Pages use `nextCursor`; message ordering is represented by positive `sequence`, not offsets. |
| Active run | `src/run/api/runActiveSnapshotResponseSchema.ts`, `runActiveSummarySchema.ts` | Partial text and the last available journal sequence are explicit. |
| Preconditions | `src/api/errors/apiPreconditionFailedResponseSchema.ts`, `src/api/errors/apiErrorResponseSchema.ts` | A stale edit/delete is a structured `412` with current revision/ETag when available; the precondition response is a member of the shared API error contract, not a generic `409`. |
| Idempotency | `src/api/schema/apiIdempotencyKeySchema.ts`, `apiIdempotencyRequestSchema.ts`, `apiIdempotencyResultSchema.ts`, `apiIdempotencyResultSchemaCreate.ts` | The client key is bounded and newline-free; normalized results distinguish a fresh result from a replay. The generic envelope does not validate `responseBody`; every operation must validate it with its operation-specific response schema through `apiIdempotencyResultSchemaCreate` before storing or replaying it. |
| Journal cursor/event | `src/stream/schema/journalCursorSchema.ts`, `journalEventIdSchema.ts`, `journalEventSchema.ts` | IDs/cursors are opaque same-user values. The server, not the client schema, enforces journal ownership and recoverability. |
| SSE frame | `src/stream/api/streamSseFrameSchema.ts`, `src/stream/api/streamSseFrameSerialize.ts` | One named JSON event per frame; frame ID/type must match event data, and the complete serialized UTF-8 frame (`id`, `event`, `data`, and terminator) is capped at 128 KiB before compression. |
| Active-run reconciliation | `src/run/api/runActiveSnapshotResponseSchema.ts`, `runActiveSummarySchema.ts` | Terminal `succeeded`, `failed`, and `aborted` statuses are intentionally accepted in these active-run schemas because reconciliation can observe a run completing between reads. A terminal status triggers authoritative reconciliation; it does not mean the run is still active. |
| UI reconciliation state | `src/ui/uiDataLayerStatusSchema.ts` | `connected`, `reconnecting`, `reconciling`, `offline`, and `stale` are explicit states rather than inferred booleans. |

## Blockers and exclusions

- Convex clients are selected whenever their environment variables are present,
  so dual-path routes are operationally active today.
- No per-user journal, sequence counter, publication bus, `/api/events`, or
  typed HTTP client exists yet.
- Existing stream IDs and sequences are per stream; they cannot be reused as
  same-user journal cursors.
- Provider execution is coupled to the request/SSE lifecycle and needs the
  process-owned run registry before the target feed can be correct.
- Existing API responses are mostly unversioned and do not consistently expose
  revisions or ETags.
- Task 1 deliberately does **not** implement Hono route infrastructure, the
  typed HTTP client, journal tables, SSE endpoints, domain migrations, cleanup,
  or dependency removal.
