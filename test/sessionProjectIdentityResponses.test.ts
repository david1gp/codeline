import { expect, test } from "bun:test"
import { sessionCreateMutationResponseCreate } from "../src/session/api/sessionCreateMutationResponseCreate.js"
import { sessionDetailResponseCreate } from "../src/session/api/sessionDetailResponseCreate.js"
import { sessionListSnapshotResponseCreate } from "../src/session/api/sessionListSnapshotResponseCreate.js"

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
  expect(list).toMatchObject({ success: true, data: { sessions: [{ projectId }] } })
  expect(detail).toMatchObject({ success: true, data: { session: { projectId } } })
  expect(mutation).toMatchObject({ success: true, data: { session: { projectId } } })
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
  expect(list.success && list.data.sessions[0]?.projectId).toBeUndefined()
  expect(detail.success && detail.data.session.projectId).toBeUndefined()
  expect(mutation.success && mutation.data.session.projectId).toBeUndefined()
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
    expect(list.success && list.data.sessions[0]).toMatchObject({ projectPath: historicalPath })
    expect(detail.success && detail.data.session).toMatchObject({ projectPath: historicalPath })
    expect(mutation.success && mutation.data.session).toMatchObject({ projectPath: historicalPath })
    expect(list.success && list.data.sessions[0]?.projectId).toBeUndefined()
    expect(detail.success && detail.data.session.projectId).toBeUndefined()
    expect(mutation.success && mutation.data.session.projectId).toBeUndefined()
  }
})
