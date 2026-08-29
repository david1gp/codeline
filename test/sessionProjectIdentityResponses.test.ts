import { expect, test } from "bun:test"
import { sessionCreateMutationResponseCreate } from "../src/session/api/sessionCreateMutationResponseCreate.js"
import { sessionDetailResponseCreate } from "../src/session/api/sessionDetailResponseCreate.js"
import { sessionListSnapshotResponseCreate } from "../src/session/api/sessionListSnapshotResponseCreate.js"
import { sessionSettledSnapshotResponseCreate } from "../src/session/api/sessionSettledSnapshotResponseCreate.js"

const userId = "session-project-identity-user"
const projectPath = "/workspace/codeline"
const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f30"
const session = {
  archivedAt: null,
  createdAt: "2026-08-28T12:00:00.000Z",
  id: "session-project-identity",
  metadata: {},
  parentSessionId: null,
  pinned: true,
  primaryAgentId: "agent-project-identity",
  projectPath,
  revision: 1,
  serverId: "server-project-identity",
  title: "Project identity",
  updatedAt: "2026-08-28T12:00:00.000Z",
}
const message = {
  agentId: session.primaryAgentId,
  clientRequestId: "message-project-identity",
  content: "Settled message",
  createdAt: "2026-08-28T12:01:00.000Z",
  finalizedAt: "2026-08-28T12:01:00.000Z",
  id: "message-project-identity",
  metadata: {},
  role: "user",
  sequence: 1,
  sessionId: session.id,
}

test("authenticated session response builders include the owning project's persisted ID", () => {
  const list = sessionListSnapshotResponseCreate({
    asOfCursor: "cursor-project-identity",
    nextCursor: null,
    representationIdentity: "session-list-project-identity",
    revision: 1,
    rows: [{ projectId, session: { ...session, userId: "row-user" } }],
    userId,
  })
  const detail = sessionDetailResponseCreate({
    agent: { id: session.primaryAgentId },
    projectId,
    server: { id: session.serverId },
    session: { ...session, userId: "row-user" },
    userId,
  })
  const mutation = sessionCreateMutationResponseCreate({
    created: true,
    projectId,
    session: { ...session, userId: "row-user" },
    userId,
  })
  const settled = sessionSettledSnapshotResponseCreate({
    asOfCursor: "cursor-project-identity",
    etag: '"session-project-identity-1"',
    messages: [message],
    projectId,
    revision: 1,
    schemaVersion: "session-snapshot-v1",
    session: { ...session, userId: "row-user" },
    userId,
  })

  expect(list).toMatchObject({ success: true, data: { sessions: [{ projectId }] } })
  expect(detail).toMatchObject({ success: true, data: { session: { projectId } } })
  expect(mutation).toMatchObject({ success: true, data: { session: { projectId } } })
  expect(settled).toMatchObject({ success: true, data: { session: { projectId } } })
})

test("authenticated response builders preserve Home as the project-less historical snapshot", () => {
  const homeSession = { ...session, projectPath: "~" }
  const list = sessionListSnapshotResponseCreate({
    asOfCursor: "cursor-home",
    nextCursor: null,
    representationIdentity: "session-list-home",
    revision: 1,
    rows: [{ session: homeSession }],
    userId,
  })
  const detail = sessionDetailResponseCreate({
    agent: { id: session.primaryAgentId },
    server: { id: session.serverId },
    session: homeSession,
    userId,
  })
  const mutation = sessionCreateMutationResponseCreate({ created: true, session: homeSession, userId })
  const settled = sessionSettledSnapshotResponseCreate({
    asOfCursor: "cursor-home",
    etag: '"session-project-identity-1"',
    messages: [],
    revision: 1,
    schemaVersion: "session-snapshot-v1",
    session: homeSession,
    userId,
  })

  expect(list.success && list.data.sessions[0]?.projectId).toBeUndefined()
  expect(detail.success && detail.data.session.projectId).toBeUndefined()
  expect(mutation.success && mutation.data.session.projectId).toBeUndefined()
  expect(settled.success && settled.data.session.projectId).toBeUndefined()
})

test("authenticated response builders keep unregistered and noncanonical historical paths project-less", () => {
  const historicalPaths = ["/workspace/unregistered", "/workspace/codeline/."]

  for (const historicalPath of historicalPaths) {
    const historicalSession = { ...session, projectPath: historicalPath }
    const list = sessionListSnapshotResponseCreate({
      asOfCursor: `cursor-${historicalPath}`,
      nextCursor: null,
      representationIdentity: `session-list-${historicalPath}`,
      revision: 1,
      rows: [{ session: historicalSession }],
      userId,
    })
    const detail = sessionDetailResponseCreate({
      agent: { id: session.primaryAgentId },
      server: { id: session.serverId },
      session: historicalSession,
      userId,
    })
    const mutation = sessionCreateMutationResponseCreate({ created: true, session: historicalSession, userId })
    const settled = sessionSettledSnapshotResponseCreate({
      asOfCursor: `cursor-${historicalPath}`,
      etag: '"session-project-identity-1"',
      messages: [],
      revision: 1,
      schemaVersion: "session-snapshot-v1",
      session: historicalSession,
      userId,
    })

    expect(list.success && list.data.sessions[0]).toMatchObject({ projectPath: historicalPath })
    expect(detail.success && detail.data.session).toMatchObject({ projectPath: historicalPath })
    expect(mutation.success && mutation.data.session).toMatchObject({ projectPath: historicalPath })
    expect(settled.success && settled.data.session).toMatchObject({ projectPath: historicalPath })
    expect(list.success && list.data.sessions[0]?.projectId).toBeUndefined()
    expect(detail.success && detail.data.session.projectId).toBeUndefined()
    expect(mutation.success && mutation.data.session.projectId).toBeUndefined()
    expect(settled.success && settled.data.session.projectId).toBeUndefined()
  }
})
