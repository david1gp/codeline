import { afterAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runDelegationsLoad } from "../src/run/actions/runDelegationsLoad.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { runDelegationsResponseCreate } from "../src/run/api/runDelegationsResponseCreate.js"
import { runDelegationsResponseSchema } from "../src/run/api/runDelegationsResponseSchema.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionChildReferenceSchema } from "../src/session/api/sessionChildReferenceSchema.js"
import { sessionBoundedSemanticStepsCreate } from "../src/session/db/sessionBoundedSemanticStepsCreate.js"
import { sessionDelegationReferencesLoad } from "../src/session/db/sessionDelegationReferencesLoad.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const prefix = `session-delegation-reference-${uuidv7()}`
const fixture = {
  agentId: `${prefix}-agent`,
  childSessionId: `${prefix}-child-session`,
  organizationId: `${prefix}-organization`,
  orphanSessionId: `${prefix}-orphan-session`,
  parentSessionId: `${prefix}-parent-session`,
  serverId: `${prefix}-server`,
  unauthorizedSessionId: `${prefix}-unauthorized-session`,
  userId: `${prefix}-user`,
  unauthorizedUserId: `${prefix}-unauthorized-user`,
}

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.unauthorizedUserId))
    await database.delete(agentTable).where(eq(agentTable.id, fixture.agentId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
  }
  await databaseConnectionClose(connection)
})

const sessionDelegationReferencesTest = async () => {
  await database.insert(applicationUserTable).values([
    { displayName: fixture.userId, id: fixture.userId },
    { displayName: fixture.unauthorizedUserId, id: fixture.unauthorizedUserId },
  ])
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: fixture.organizationId,
  })
  await database.insert(serverTable).values({
    endpoint: `http://${fixture.serverId}.test`,
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
  await database.insert(sessionTable).values([
    {
      clientRequestId: `${prefix}-parent-request`,
      id: fixture.parentSessionId,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Parent session",
      userId: fixture.userId,
    },
    {
      clientRequestId: `${prefix}-child-request`,
      id: fixture.childSessionId,
      metadata: {},
      parentSessionId: fixture.parentSessionId,
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Child session",
      userId: fixture.userId,
    },
    {
      clientRequestId: `${prefix}-unauthorized-request`,
      id: fixture.unauthorizedSessionId,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Unauthorized session",
      userId: fixture.unauthorizedUserId,
    },
  ])

  await connection.client.execute("PRAGMA foreign_keys=OFF")
  await database.insert(sessionTable).values({
    clientRequestId: `${prefix}-orphan-request`,
    id: fixture.orphanSessionId,
    metadata: {},
    parentSessionId: `${prefix}-missing-parent-session`,
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Orphan session",
    userId: fixture.userId,
  })
  await connection.client.execute("PRAGMA foreign_keys=ON")

  const snapshot = {
    configuration: { model: "reference-model", provider: "deterministic" as const },
    configurationRevision: `${prefix}-revision`,
    target: { agentId: fixture.agentId, serverId: fixture.serverId },
  }
  const budget = { maxChildDepth: 1, maxChildRuns: 8, maxDurationMs: 10_000 }
  const parent = await runCreate(database, fixture.userId, fixture.parentSessionId, {
    budget,
    clientRunId: `${prefix}-parent-client-run`,
    snapshot,
    streamId: `${prefix}-parent-stream`,
  })
  expect(parent.success).toBe(true)
  if (!parent.success) return
  expect(
    await runTransition(database, fixture.userId, fixture.parentSessionId, parent.data.run.id, { status: "running" }),
  ).toMatchObject({ success: true })

  const child = await runCreate(database, fixture.userId, fixture.childSessionId, {
    budget,
    clientRunId: `${prefix}-child-client-run`,
    snapshot,
    streamId: `${prefix}-child-stream`,
  })
  const orphan = await runCreate(database, fixture.userId, fixture.orphanSessionId, {
    budget,
    clientRunId: `${prefix}-orphan-client-run`,
    snapshot,
    streamId: `${prefix}-orphan-stream`,
  })
  const unauthorized = await runCreate(database, fixture.unauthorizedUserId, fixture.unauthorizedSessionId, {
    budget,
    clientRunId: `${prefix}-unauthorized-client-run`,
    snapshot,
    streamId: `${prefix}-unauthorized-stream`,
  })
  expect(child.success && orphan.success && unauthorized.success).toBe(true)
  if (!child.success || !orphan.success || !unauthorized.success) return

  const delegationCreate = (input: {
    childRunId: string
    delegationKey: string
    id: string
    parentAttemptId?: string
    parentRunId?: string
    rootOrdinal: number
  }) => ({
    childRunId: input.childRunId,
    createdAt: new Date(),
    delegationKey: input.delegationKey,
    depth: 1,
    finalizedResult: null,
    id: input.id,
    parentAttemptId: input.parentAttemptId ?? parent.data.attempt.id,
    parentRunId: input.parentRunId ?? parent.data.run.id,
    rootOrdinal: input.rootOrdinal,
    rootRunId: parent.data.run.id,
    sessionId: fixture.parentSessionId,
    task: `Task ${input.delegationKey}`,
    updatedAt: new Date(),
    userId: fixture.userId,
  })

  await connection.client.execute("PRAGMA foreign_keys=OFF")
  await database.insert(runDelegationTable).values([
    delegationCreate({
      childRunId: child.data.run.id,
      delegationKey: "normal-child",
      id: `${prefix}-delegation-normal`,
      rootOrdinal: 1,
    }),
    delegationCreate({
      childRunId: orphan.data.run.id,
      delegationKey: "orphan-child",
      id: `${prefix}-delegation-orphan`,
      rootOrdinal: 2,
    }),
    delegationCreate({
      childRunId: parent.data.run.id,
      delegationKey: "missing-parent",
      id: `${prefix}-delegation-missing-parent`,
      parentAttemptId: `${prefix}-missing-attempt`,
      parentRunId: `${prefix}-missing-parent-run`,
      rootOrdinal: 3,
    }),
    delegationCreate({
      childRunId: unauthorized.data.run.id,
      delegationKey: "unauthorized-child",
      id: `${prefix}-delegation-unauthorized`,
      rootOrdinal: 4,
    }),
  ])
  await connection.client.execute("PRAGMA foreign_keys=ON")

  const loaded = await sessionDelegationReferencesLoad(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.parentSessionId,
  )
  expect(loaded.success).toBe(true)
  if (!loaded.success) return

  const normal = loaded.data.delegations.find(({ delegation }) => delegation.delegationKey === "normal-child")
  expect(normal).toMatchObject({
    childReference: {
      childRunId: child.data.run.id,
      delegationId: `${prefix}-delegation-normal`,
      parentSessionId: fixture.parentSessionId,
    },
    childSessionId: fixture.childSessionId,
    parentSessionId: fixture.parentSessionId,
  })
  expect(v.safeParse(sessionChildReferenceSchema, normal?.childReference).success).toBe(true)

  for (const key of ["orphan-child", "missing-parent", "unauthorized-child"]) {
    const reference = loaded.data.delegations.find(({ delegation }) => delegation.delegationKey === key)
    expect(reference).toMatchObject({ childReference: null, childSessionId: null })
  }

  const projected = sessionBoundedSemanticStepsCreate({
    attempts: [parent.data.attempt],
    delegationReferences: loaded.data.byToolKey,
    events: [
      {
        createdAt: new Date(),
        eventType: "delta",
        id: uuidv7(),
        payload: {
          delta: JSON.stringify({ toolCallId: "normal-child", toolName: "delegate_task" }),
          deltaKind: "tool",
          messageId: null,
          runId: parent.data.run.id,
          sessionId: fixture.parentSessionId,
        },
        runId: parent.data.run.id,
        sequence: 1,
        serializedBytes: 1,
        userId: fixture.userId,
      },
    ],
    messages: [],
    runs: [parent.data.run],
  })
  expect(projected.success).toBe(true)
  if (!projected.success) return
  expect(projected.data.find((step) => step.kind === "tool")).toMatchObject({
    childReference: {
      childRunId: child.data.run.id,
      childSessionId: fixture.childSessionId,
      delegationId: `${prefix}-delegation-normal`,
      parentSessionId: fixture.parentSessionId,
    },
  })

  const runWithoutVisibleEvents = sessionBoundedSemanticStepsCreate({
    attempts: [parent.data.attempt],
    delegationReferences: loaded.data.byToolKey,
    events: [],
    messages: [],
    runs: [parent.data.run],
  })
  expect(runWithoutVisibleEvents).toMatchObject({ data: [], success: true })

  const delegations = await runDelegationsLoad(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.parentSessionId,
  )
  expect(delegations.success).toBe(true)
  if (!delegations.success) return
  expect(delegations.data.delegations.find(({ delegationKey }) => delegationKey === "normal-child")).toMatchObject({
    childSessionId: fixture.childSessionId,
    delegationId: `${prefix}-delegation-normal`,
    parentSessionId: fixture.parentSessionId,
  })
  const response = runDelegationsResponseCreate({ ...delegations.data, sessionId: fixture.parentSessionId })
  expect(response.success).toBe(true)
  if (response.success) expect(v.safeParse(runDelegationsResponseSchema, response.data).success).toBe(true)

  const unauthorizedParent = await sessionDelegationReferencesLoad(
    database,
    fixture.unauthorizedUserId,
    fixture.organizationId,
    fixture.parentSessionId,
  )
  expect(unauthorizedParent.success).toBe(false)
}

test.skipIf(!databaseAvailable)(
  "projects authorized stable child references into delegation and tool APIs",
  sessionDelegationReferencesTest,
)
