# Bounded session history

## Goal

Open a session with the latest agent answer and about 25 recent semantic steps, keep live state current without transferring full history, load older context and tool/run details on demand, expose authoritative waiting state when supported, and open delegated child conversations from their parent timeline.

Lasting architecture: [`docs/20260822_http_sse_migration_plan.md`](20260822_http_sse_migration_plan.md).

## Decisions

- Keep messages, runs, attempts, delegations, and journal events canonical; add a session-owned history projection for bounded reads.
- Use one bounded, transactionally consistent session snapshot with a session-local `throughPosition`, latest answer, projected entries, current run/input state, and an opaque older-page cursor.
- Page backward by immutable projected-entry positions fixed to the snapshot `throughPosition`; never use offsets or paginate token deltas.
- Start the selected-session live tail from the snapshot's session `changePosition` cursor; apply immutable timeline ordering by `position` and retain only lightweight lifecycle/input-needed summaries on the user-wide feed.
- Represent tool and run timeline entries compactly and fetch full normalized details only when expanded.
- Treat `waiting_for_input` as explicit durable state only when supported by an authoritative runtime event; do not infer it from tool names.
- Navigate delegations by `parentSessionId + childRunId + delegationId`, using the existing right-side child conversation panel and the same bounded loading contract.
- Reuse existing repository libraries and generic `#ui` components; keep `./ui` read-only.

## Approach

- The bounded session-history implementation and cutover are complete; the lasting decisions are recorded in the HTTP/SSE migration plan linked above.
- Add backend schemas and transactional read models before changing existing selected-session reads.
- Introduce the bounded snapshot and fixed-watermark older-history API, then add lazy detail and child references.
- Migrate selected-session state to bounded snapshot-plus-tail with authoritative monotonic reconciliation: retain the visible tail until replacement succeeds, reject stale replacements/events, resnapshot after reset or retention eviction, and never synthesize positions.
- Update the existing conversation and subagent panel UI rather than creating a new route or visual system.
- Verify each increment with focused tests at concurrency 1, then verify through the repository-managed combined preview service and browser.

## Current context

The bounded-history cutover is complete. Waiting-for-input history remains deferred until the runtime provides an authoritative durable request and resolution protocol.

## Session history projection contract

This section defines the implemented contract for the atomic bounded-history cutover. `globalSequence`
remains the user-global journal order, while `position` and `throughPosition` are session-local and
are never compared with it.

### Projection matrix

| Record | Stable source identity | Create behavior | Update behavior |
| --- | --- | --- | --- |
| Message entry | `("message", message.id)` | Create exactly once with the canonical finalized message. A branch copy has its new target-session message ID and therefore creates a new target-session entry. | Immutable; an idempotent append retry reuses the existing message and entry. |
| Run-summary entry | `("run", run.id)` | Create exactly once in the same transaction as the run and initial attempt, including child runs. | Update the same entry for accepted, running, terminal, retry, failure, and cancellation state; never create an entry per attempt. |
| Tool-summary entry | `("tool", run.id, toolCallId)` | Create on the first authoritative observation of the stable tool call. The existing detail contract scopes `toolCallId`/`detailId` by `runId`. | Update the same entry as bounded name, output/result state, outcome, and delegation metadata become available. Repeated events for the same run/tool call do not create another entry. |
| Delegation metadata | `delegation.id`, attached to `("tool", parentRunId, delegationKey)` | Attach `{ delegationId, parentSessionId, childRunId }` to the parent tool entry in the child-creation transaction, creating that tool entry first if needed. | Finalization updates that tool entry; there is no separate delegation timeline entry. |
| Bounded active-run state | `run.id`; not a history entry | Create with the active run. | Replace bounded partial state transactionally as output arrives, then remove it only after finalized detail is durable. It has `changePosition` values but no timeline position of its own. |
| Finalized run detail | `run.id`; not a history entry | Persist one bounded run transcript and its bounded tool details before deleting run deltas. | Immutable after terminal persistence; an identical terminal retry is a no-op and conflicting terminal content is an invariant failure. |

Storage may encode compound source identities differently, but it must preserve the components
without collisions. In particular, a bare `toolCallId` or `detailId` is not session-unique. Each
history entry also has a stable public entry ID. Both that ID and the source identity remain unchanged
for the life of the entry.

### Transaction, ordering, and mutation invariants

1. A session owns its projection. Session/user ownership is checked on every write and read;
   `(sessionId, source identity)` and `(sessionId, position)` are unique.
2. Canonical writes and all affected history entries, bounded active state, finalized detail, and
   session-counter changes use the caller's `DatabaseExecutor` and commit or roll back in one outer
   transaction. Projection helpers do not open an independent transaction. This includes message
   append and branch prefix copy, run and child-run creation, lifecycle transitions, tool output,
   delegation creation/finalization, startup interruption, and every terminal path.
3. The session row owns one monotonic counter. A projection-changing create or update atomically
   increments it; `max(position) + 1` is forbidden. A new entry uses the allocated value as both its
   immutable ordering `position` and its latest `changePosition`. Updating an existing entry or
   bounded active state allocates a new `changePosition` but never changes the entry's ordering
   `position`. An idempotent no-op allocates nothing. Committed values are positive, may have gaps,
   and are never reused.
4. Mutable run/tool summaries are current-state projections, not historical payload versions. Their
   source identity, public entry ID, and ordering position are immutable; bounded summary, lifecycle,
   detail availability, and delegation fields may change. Terminal kind is exact and immutable.
5. Run finalization persists and validates finalized detail before deleting deltas, in the same
   transaction as canonical terminal state and projection updates. Failure of any step rolls back the
   terminal transition and deletion. Stream publication occurs only after commit.

`changePosition` is distinct from an entry's ordering `position` so that an update to an old mutable
entry can be resumed after a snapshot without moving that entry in history. This also makes the
selected-session stream handoff well-defined.

### Watermark and cursor invariants

- `throughPosition` is the session counter high-water mark observed in the same read transaction as
  a snapshot. Zero means that the session has no projected changes.
- Snapshot and older-page membership is `entry.position <= throughPosition`; ordering is by immutable
  `position`. New entries after the watermark never enter those pages. Later requests may return a
  newer mutable summary for an existing member because full historical payload versioning is out of
  scope; its membership and order do not change.
- Older pages use descending keyset work bounded to `limit + 1`, return entries in ascending display
  order, and carry the original `throughPosition` unchanged. With unique positions, the exclusive
  boundary is `beforePosition`; no offset or tie-break ID is needed.
- An older-page cursor is opaque and authenticated. Its claims payload contains exactly cursor
  `kind` and `version`, `userId`, `sessionId`, `throughPosition`, and exclusive `beforePosition`; the
  codec envelope may contain authentication metadata. A selected-session stream cursor is a
  different kind and carries `userId`, `sessionId`, and the last applied `changePosition`. Global
  cursors continue to carry global journal ownership and `globalSequence` instead.
- The server validates cursor shape/version/kind, authenticated user, requested session, organization
  access, non-negative safe-integer positions, `beforePosition <= throughPosition`, and that claimed
  positions are not ahead of the authorized session counter. A cursor is continuation state, never
  authorization; clients store and return it without decoding or numeric conversion.

### Detail, child-run, and stream contracts

- Finalized run and tool detail payloads preserve the bounded shapes owned by
  `runDetailResponseSchema.ts` and `runToolDetailResponseSchema.ts`, including explicit run/session
  identity and the limits in `runTranscriptSchema.ts` and `runToolDetailSchema.ts`. Terminal reads
  come only from the durable finalized-detail record; a missing record is an invariant error, not a
  reason to reconstruct deleted deltas.
- Detail response envelopes are `{ kind: "finalized", detail: <existing bounded response> }` or
  `{ kind: "active", run: { id, sessionId, status }, detail: <bounded active data or null> }`.
  Tool-active results also identify the requested `detailId`. Active responses are never cached as
  finalized detail. Both paths authorize through user, session, server, and organization ownership.
- Normal delegated child runs remain in the parent session. Child navigation and reads use the stable
  triple `parentSessionId + childRunId + delegationId`; they do not require or synthesize a child
  session. The server derives the parent session through `runDelegationTable`; the delegation must
  belong to that session and name that child run. Branch sessions remain separate and continue to use
  `session.parentSessionId`.
- The global feed and selected-session stream have separate schemas, authorization, cursors, and replay
  behavior. Global frames are ordered by `globalSequence` and contain only lifecycle summaries,
  invalidations, and authoritative input-needed summaries; an expired global cursor returns HTTP 400 and
  triggers reconciliation rather than delivering a reset frame. Transcript, tool, thinking, provider, and
  generic delta payloads are prohibited. Selected-session frames are ordered
  by `changePosition`, identify the stable projected entry when applicable, and carry its immutable
  ordering `position` separately.
- Every named JSON SSE frame must have matching frame/data ID and event type. The
  `globalSummarySseFrameSchema` and `sessionDetailSseFrameSchema` validators enforce their respective
  frame contracts. Before emission, `streamSseConnectionWriterCreate.ts` validates and serializes the
  complete UTF-8 frame with `streamSseFrameSerialize.ts`—`id`, `event`, `data`, separators, and final
  blank line—and enforces a maximum of 128 KiB before compression. Producers must bound, split, invalidate,
  or reset rather than emit an oversized frame.

These rules extend existing contracts rather than treating current reconstruction as the target:
`databaseExecutorTransactionRun.ts` already composes nested repository calls into an outer
transaction; message idempotency is session-scoped in `messageRepositoryAppend.ts` and
`messageRepositoryAppendMutation.ts`; run idempotency is `(sessionId, clientRunId)` in
`runRepositoryCreate.ts`; tool details use `(runId, toolCallId)` through
`runToolDetailIdCreate.ts`; delegation ownership and idempotency are defined by
`runDelegationTable.ts` and `runRepositoryChildCreate.ts`; opaque payload cursors are supported by
`journalCursorCodecCreate.ts`; and the complete-frame limit is enforced by
`streamSseConnectionWriterCreate.ts` and the two frame validators. Session creation, copied messages, and
their projections participate in one outer transaction; this contract has no separate-write exception.

## Tasks

- [x] 1. Add bounded snapshot, semantic-step, watermark, and cursor contracts with focused schema tests.
- [x] 2. Implement the transactionally consistent bounded session snapshot repository/action/API and handoff tests.
- [x] 3. Implement fixed-`throughPosition` backward keyset pagination for older semantic history and stability tests.
- [x] 4. Add compact run/tool projections and lazy run/tool detail API with payload-boundary tests.
- [x] 5. Handle waiting-for-input only where the runtime protocol supports it; defer authoritative waiting-for-input history until a durable request and resolution protocol exists.
- [x] 6. Add delegation navigation and API coverage using `parentSessionId + childRunId + delegationId`.
- [x] 7. Migrate selected-session client state to bounded snapshot-plus-tail with incremental older-page loading.
- [x] 8. Update the session UI to emphasize the latest answer, show about 25 recent semantic steps, load older steps, lazily expand details, display supported waiting state, and open child conversations.
- [x] 9. Run focused and repository verification, then test the combined managed preview in a browser.
- [x] 10. Review the completed implementation, record its lasting architecture decisions, and close this plan.
