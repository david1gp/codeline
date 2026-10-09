import { afterAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { agentTable } from "../../../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../../../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../../../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../../../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../../../src/identity/db/organizationTable.js"
import { runChildCreate } from "../../../src/run/actions/runChildCreate.js"
import { runCreate } from "../../../src/run/actions/runCreate.js"
import { runDelegationContinuationAck } from "../../../src/run/actions/runDelegationContinuationAck.js"
import { runTransition } from "../../../src/run/actions/runTransition.js"
import { runDelegationTable } from "../../../src/run/db/runDelegationTable.js"
import { serverTable } from "../../../src/servers/db/serverTable.js"
import { sessionTable } from "../../../src/session/db/sessionTable.js"
import { uuidv7 } from "../../../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "../../database/fixtures/databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)

afterAll(async () => {
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("acknowledges background continuations idempotently", async () => {
  const userId = `continuation-ack-user-${uuidv7()}`
  const organizationId = `continuation-ack-organization-${uuidv7()}`
  const serverId = `continuation-ack-server-${uuidv7()}`
  const agentId = `continuation-ack-agent-${uuidv7()}`
  const sessionId = `continuation-ack-session-${uuidv7()}`

  await database.insert(applicationUserTable).values({ displayName: "Continuation Ack User", id: userId })
  await database.insert(organizationTable).values({
    externalId: organizationId,
    id: organizationId,
    name: "Continuation Ack Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://continuation-ack.test",
    id: serverId,
    name: "Continuation Ack Server",
    organizationId,
  })
  await database.insert(agentTable).values({ id: agentId, name: "Continuation Ack Agent", role: "coding", serverId })
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: agentId,
    serverId,
    title: "Continuation Ack Session",
    userId,
  })

  const snapshot = {
    configuration: { model: "continuation-ack-model", provider: "deterministic" as const },
    configurationRevision: "continuation-ack-revision",
    target: { agentId, serverId },
  }
  const parent = await runCreate(database, userId, sessionId, {
    budget: { maxChildDepth: 1, maxChildRuns: 2, maxDurationMs: 10_000 },
    clientRunId: `continuation-ack-parent-${uuidv7()}`,
    snapshot,
    streamId: `continuation-ack-parent-stream-${uuidv7()}`,
  })
  expect(parent.success).toBe(true)
  if (!parent.success) return
  expect(await runTransition(database, userId, sessionId, parent.data.run.id, { status: "running" })).toMatchObject({
    success: true,
  })

  const child = await runChildCreate(database, userId, sessionId, {
    background: true,
    delegationKey: "continuation-ack-task",
    parentAttemptId: parent.data.attempt.id,
    parentRunId: parent.data.run.id,
    task: "Research in the background.",
  })
  expect(child.success).toBe(true)
  if (!child.success) return
  expect(child.data.delegation.background).toBe(1)

  // Not finalized yet: nothing to acknowledge.
  const pending = await runDelegationContinuationAck(database, userId, sessionId, child.data.delegation.id)
  expect(pending.success).toBe(true)
  if (!pending.success) return
  expect(pending.data).toMatchObject({ alreadyDelivered: true, delivered: true })

  await database
    .update(runDelegationTable)
    .set({ finalizedResult: { status: "succeeded", text: "background result" } })
    .where(eq(runDelegationTable.id, child.data.delegation.id))

  const first = await runDelegationContinuationAck(database, userId, sessionId, child.data.delegation.id)
  expect(first.success).toBe(true)
  if (!first.success) return
  expect(first.data).toMatchObject({ alreadyDelivered: false, delivered: true })

  const second = await runDelegationContinuationAck(database, userId, sessionId, child.data.delegation.id)
  expect(second.success).toBe(true)
  if (!second.success) return
  expect(second.data).toMatchObject({ alreadyDelivered: true, delivered: true })

  const missing = await runDelegationContinuationAck(database, userId, sessionId, `missing-${uuidv7()}`)
  expect(missing.success).toBe(false)
})
