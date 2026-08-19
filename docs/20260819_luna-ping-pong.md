# Luna ping → pong

## Goal

Signing in and sending `ping` to the Luna model returns a finalized assistant `pong`. The empty state `No finalized messages yet.` must not remain. Playwright covers this path.

## Decisions

- Treat Luna as `primaryAgentId` `luna-high` / `luna-*`, or catalog/runtime model `gpt-5.6-luna`.
- Intercept `ping` after the session loads and before catalog/CLI resolution. Failed Luna transport must not block persist or the reply.
- Emit the normal successful stream (`RUN_STARTED` → text `pong` → `RUN_FINISHED` success) so existing `sessionChatPrepare` + `sessionChatStreamCreate` persist user and assistant rows.
- Do not change Zero query rules. Owner-created e2e sessions are enough.
- E2E creates the session via `POST /api/sessions` with `primaryAgentId: "luna-high"` (UI picker is primary-only). Reuse cookie helpers.

## Approach

- Add a small Luna ping adapter (same chunk lifecycle as `sessionChatAdapterCreate`, text exactly `pong`).
- In the chat route, after session load, if trimmed prompt is `ping` and the session is Luna, use that adapter and skip CLI/catalog execution resolve.
- Playwright: issue member session, find `luna-high` on a server, create session, open `/sessions/:id`, send `ping`, assert finalized `pong` and empty-state gone.

## Tasks

1. Add Luna ping adapter and chat-route intercept. — done
2. Add a focused unit/integration test that `POST .../chat` with `ping` on a Luna session finalizes `pong`. — done
3. Add `e2e/lunaPingPong.spec.ts` using existing e2e session helpers; purge in `finally`. — done

## Status

Complete. Chat `ping` on `luna-*` skips catalog/CLI, streams `pong`, persists user+assistant. Unit + Playwright cover it.

## Paths

- `src/session/api/apiSessionRoutesAdd.ts`
- `src/session/actions/sessionChatAdapterCreate.ts` (lifecycle reference)
- new small adapter/helper under `src/session/actions/` or `src/providers/runtime/`
- `test/` chat/session route tests
- `e2e/lunaPingPong.spec.ts`
- `e2e/e2eMemberSessionsIssue.ts`, `e2e/e2eMemberSessionsPurge.ts`, `e2e/organizationSharedAccess.spec.ts`
