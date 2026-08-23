import { afterAll, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runSessionStreamSnapshotLoad } from "../src/run/actions/runSessionStreamSnapshotLoad.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { streamAppend } from "../src/stream/actions/streamAppend.js"
import { streamEventTable } from "../src/stream/db/streamEventTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)

afterAll(async () => {
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)(
  "loads an organization-authorized, deterministic durable run and stream snapshot",
  async () => {
    const userKey = `stream-snapshot-user-${uuidv7()}`
    const userId = `development:${userKey}`
    const organizationId = `stream-snapshot-organization-${uuidv7()}`
    const serverId = `stream-snapshot-server-${uuidv7()}`
    const agentId = `stream-snapshot-agent-${uuidv7()}`
    const sessionId = `stream-snapshot-session-${uuidv7()}`

    try {
      const user = await developmentIdentityUpsert(database, {
        displayName: "Stream Snapshot User",
        identityKey: userKey,
      })
      if (!user.success) throw new Error(user.errorMessage)
      await database.insert(organizationTable).values({
        externalId: organizationId,
        id: organizationId,
        name: "Stream Snapshot Organization",
      })
      await database.insert(serverTable).values({
        endpoint: "http://stream-snapshot.test",
        id: serverId,
        name: "Stream Snapshot Server",
        organizationId,
      })
      await database.insert(agentTable).values({ id: agentId, name: "Stream Snapshot Agent", role: "coding", serverId })
      await database.insert(sessionTable).values({
        clientRequestId: uuidv7(),
        id: sessionId,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Stream Snapshot Session",
        userId,
      })

      const snapshot = {
        configuration: { model: "stream-snapshot-model", provider: "deterministic" as const },
        configurationRevision: "stream-snapshot-revision",
        target: { agentId, serverId },
      }
      const first = await runCreate(database, userId, sessionId, {
        budget: { maxDurationMs: 10_000 },
        clientRunId: `stream-snapshot-run-a-${uuidv7()}`,
        snapshot,
        streamId: "stream-b",
      })
      const second = await runCreate(database, userId, sessionId, {
        budget: { maxDurationMs: 10_000 },
        clientRunId: `stream-snapshot-run-b-${uuidv7()}`,
        snapshot,
        streamId: "stream-a",
      })
      expect(first.success).toBe(true)
      expect(second.success).toBe(true)
      if (!first.success || !second.success) return

      const sameCreatedAt = new Date("2026-08-23T00:00:00.000Z")
      await database
        .update(runTable)
        .set({ createdAt: sameCreatedAt, updatedAt: sameCreatedAt })
        .where(and(eq(runTable.id, first.data.run.id), eq(runTable.sessionId, sessionId)))
      await database
        .update(runTable)
        .set({ createdAt: sameCreatedAt, updatedAt: sameCreatedAt })
        .where(and(eq(runTable.id, second.data.run.id), eq(runTable.sessionId, sessionId)))

      expect(
        await streamAppend(database, userId, sessionId, {
          eventType: "text_delta",
          idempotencyKey: "stream-snapshot-event-a",
          payload: { delta: "a" },
          sequence: 1,
          streamId: "stream-b",
        }),
      ).toMatchObject({ success: true })
      expect(
        await streamAppend(database, userId, sessionId, {
          eventType: "text_delta",
          idempotencyKey: "stream-snapshot-event-b",
          payload: { delta: "b" },
          sequence: 1,
          streamId: "stream-a",
        }),
      ).toMatchObject({ success: true })
      await database
        .update(streamEventTable)
        .set({ createdAt: sameCreatedAt })
        .where(eq(streamEventTable.sessionId, sessionId))

      const loaded = await runSessionStreamSnapshotLoad(database, userId, organizationId, sessionId)
      expect(loaded.success).toBe(true)
      if (!loaded.success) return
      expect(loaded.data.runs.map((run) => run.streamId)).toEqual(
        [first.data.run, second.data.run]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((run) => run.streamId),
      )
      expect(loaded.data.runs.every((run) => run.attempts.length === 1)).toBe(true)
      expect(loaded.data.events.map((event) => event.streamId)).toEqual(["stream-a", "stream-b"])
      expect(await runSessionStreamSnapshotLoad(database, userId, "other-organization", sessionId)).toMatchObject({
        errorMessage: "The session could not be found.",
        success: false,
      })
    } finally {
      await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
      await database
        .delete(serverTable)
        .where(and(eq(serverTable.id, serverId), eq(serverTable.organizationId, organizationId)))
      await database.delete(organizationTable).where(eq(organizationTable.id, organizationId))
    }
  },
)
