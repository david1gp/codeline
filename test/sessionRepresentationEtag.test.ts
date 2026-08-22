import { expect, test } from "bun:test"
import { sessionDetailResponseCreate } from "../src/session/api/sessionDetailResponseCreate.js"
import { sessionListSnapshotResponseCreate } from "../src/session/api/sessionListSnapshotResponseCreate.js"

const session = {
  archivedAt: null,
  createdAt: "2026-08-22T12:00:00.000Z",
  id: "session-etag-test",
  metadata: {},
  parentSessionId: null,
  pinned: true,
  primaryAgentId: "agent-etag-test",
  projectPath: "~",
  revision: 4,
  serverId: "server-etag-test",
  title: "ETag session",
  updatedAt: "2026-08-22T12:00:00.000Z",
}

test("session bodies containing authenticated cursors have stable, cursor-specific strong ETags", () => {
  const first = sessionDetailResponseCreate({
    agent: { id: session.primaryAgentId },
    asOfCursor: "cursor-a",
    server: { id: session.serverId },
    session,
  })
  const repeated = sessionDetailResponseCreate({
    agent: { id: session.primaryAgentId },
    asOfCursor: "cursor-a",
    server: { id: session.serverId },
    session,
  })
  const changedCursor = sessionDetailResponseCreate({
    agent: { id: session.primaryAgentId },
    asOfCursor: "cursor-b",
    server: { id: session.serverId },
    session,
  })

  expect(first).toEqual(repeated)
  expect(first.success && changedCursor.success ? first.data.etag !== changedCursor.data.etag : false).toBe(true)
  expect(first.success && changedCursor.success ? first.data.asOfCursor !== changedCursor.data.asOfCursor : false).toBe(
    true,
  )
})

test("session list ETags include the opaque asOf cursor representation", () => {
  const first = sessionListSnapshotResponseCreate({
    asOfCursor: "cursor-a",
    nextCursor: null,
    representationIdentity: "session-list:user-a:organization-a:{}",
    revision: 4,
    rows: [{ session }],
  })
  const changedCursor = sessionListSnapshotResponseCreate({
    asOfCursor: "cursor-b",
    nextCursor: null,
    representationIdentity: "session-list:user-a:organization-a:{}",
    revision: 4,
    rows: [{ session }],
  })

  expect(first.success).toBe(true)
  expect(changedCursor.success).toBe(true)
  if (!first.success || !changedCursor.success) return
  expect(first.data.etag).not.toBe(changedCursor.data.etag)
})
