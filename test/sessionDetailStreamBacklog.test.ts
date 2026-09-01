import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionDetailStreamBacklogRead } from "../src/session/actions/sessionDetailStreamBacklogRead.js"
import type { SessionDetailSseFrame } from "../src/session/api/sessionDetailSseFrameSchema.js"
import { sessionHistoryEntryTable } from "../src/session/db/sessionHistoryEntryTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-session-detail-stream."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: "session-detail-stream-agent",
  organizationId: "session-detail-stream-organization",
  serverId: "session-detail-stream-server",
  sessionId: "session-detail-stream-session",
  userId: "session-detail-stream-user",
}
const cursorCodecResult = journalCursorCodecCreate({ randomBytes, secret: "session-detail-stream-secret" })
if (!cursorCodecResult.success) throw new Error(cursorCodecResult.errorMessage)
const cursorCodec = cursorCodecResult.data

beforeAll(async () => {
  await database.insert(applicationUserTable).values({ displayName: fixture.userId, id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: fixture.organizationId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-detail-stream.test",
    id: fixture.serverId,
    name: fixture.serverId,
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: fixture.agentId,
    role: "coding",
    serverId: fixture.serverId,
  })
  await database.insert(sessionTable).values({
    clientRequestId: "session-detail-stream-request",
    id: fixture.sessionId,
    nextHistoryPosition: 5,
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: fixture.sessionId,
    userId: fixture.userId,
  })
  await database.insert(sessionHistoryEntryTable).values([
    {
      changePosition: 1,
      id: "session-detail-stream-entry-1",
      kind: "message",
      payload: { content: "one", role: "user" },
      position: 1,
      sessionId: fixture.sessionId,
      sourceDetailId: "",
      sourceId: "session-detail-stream-message-1",
      sourceType: "message",
      userId: fixture.userId,
    },
    {
      changePosition: 3,
      id: "session-detail-stream-entry-2",
      kind: "run",
      payload: { status: "running" },
      position: 2,
      sessionId: fixture.sessionId,
      sourceDetailId: "",
      sourceId: "session-detail-stream-run-1",
      sourceType: "run",
      userId: fixture.userId,
    },
    {
      changePosition: 4,
      id: "session-detail-stream-entry-3",
      kind: "tool",
      payload: { runId: "session-detail-stream-run-1", toolName: "bash" },
      position: 3,
      sessionId: fixture.sessionId,
      sourceDetailId: "session-detail-stream-tool-1",
      sourceId: "session-detail-stream-run-1",
      sourceType: "tool",
      userId: fixture.userId,
    },
  ])
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

async function collectFrames(result: Awaited<ReturnType<typeof sessionDetailStreamBacklogRead>>) {
  const frames: SessionDetailSseFrame[] = []
  if (!result.success) return frames
  for await (const page of result.data.pages) if (page.success) frames.push(...page.data)
  return frames
}

test("replays the selected session by changePosition while retaining entry position and stable IDs", async () => {
  const result = await sessionDetailStreamBacklogRead(
    database,
    { organizationId: fixture.organizationId, sessionId: fixture.sessionId, userId: fixture.userId },
    { cursorCodec },
  )
  expect(result).toMatchObject({ data: { afterChangePosition: 0, mode: "replay", replayUpperBound: 4 }, success: true })
  const frames = await collectFrames(result)
  expect(frames.map((frame) => frame.data.eventType === "entry" && frame.data.changePosition)).toEqual([1, 3, 4])
  expect(frames.map((frame) => frame.data.eventType === "entry" && frame.data.position)).toEqual([1, 2, 3])
  expect(frames.map((frame) => frame.data.eventType === "entry" && frame.data.entryId)).toEqual([
    "session-detail-stream-entry-1",
    "session-detail-stream-entry-2",
    "session-detail-stream-entry-3",
  ])
  expect(
    frames.every((frame) => frame.data.eventType === "entry" && !Object.hasOwn(frame.data, "globalSequence")),
  ).toBe(true)
})

test("validates the separately authenticated session cursor and resets a future cursor", async () => {
  const after = cursorCodec.encodeSessionPosition?.(fixture.userId, fixture.sessionId, 3)
  expect(after?.success).toBe(true)
  if (after === undefined || !after.success) return
  const replay = await sessionDetailStreamBacklogRead(
    database,
    { after: after.data, organizationId: fixture.organizationId, sessionId: fixture.sessionId, userId: fixture.userId },
    { cursorCodec },
  )
  expect(replay).toMatchObject({ data: { afterChangePosition: 3, mode: "replay" }, success: true })
  expect(
    (await collectFrames(replay)).map((frame) => frame.data.eventType === "entry" && frame.data.changePosition),
  ).toEqual([4])

  const future = cursorCodec.encodeSessionPosition?.(fixture.userId, fixture.sessionId, 99)
  expect(future?.success).toBe(true)
  if (future === undefined || !future.success) return
  const reset = await sessionDetailStreamBacklogRead(
    database,
    {
      lastEventId: future.data,
      organizationId: fixture.organizationId,
      sessionId: fixture.sessionId,
      userId: fixture.userId,
    },
    { cursorCodec },
  )
  expect(reset).toMatchObject({ data: { mode: "reset", replayUpperBound: 4 }, success: true })
  const resetFrames = await collectFrames(reset)
  expect(resetFrames).toHaveLength(1)
  expect(resetFrames[0]?.data).toMatchObject({ asOfPosition: 4, eventType: "reset", sessionId: fixture.sessionId })
})

test("does not authorize a cursor or session through another user or organization", async () => {
  const cursor = cursorCodec.encodeSessionPosition?.("another-user", fixture.sessionId, 1)
  expect(cursor?.success).toBe(true)
  if (cursor === undefined || !cursor.success) return
  const wrongOwner = await sessionDetailStreamBacklogRead(
    database,
    {
      after: cursor.data,
      organizationId: fixture.organizationId,
      sessionId: fixture.sessionId,
      userId: fixture.userId,
    },
    { cursorCodec },
  )
  expect(wrongOwner).toMatchObject({ code: "cursor_owner_mismatch", success: false })

  const wrongOrganization = await sessionDetailStreamBacklogRead(
    database,
    { organizationId: "another-organization", sessionId: fixture.sessionId, userId: fixture.userId },
    { cursorCodec },
  )
  expect(wrongOrganization).toMatchObject({ code: "session_not_found", success: false })
  const entries = await database
    .select({ id: sessionHistoryEntryTable.id })
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, fixture.sessionId))
  expect(entries).toHaveLength(3)
})
