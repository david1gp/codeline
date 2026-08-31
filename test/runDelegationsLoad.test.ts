import { afterAll, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { runChildCreate } from "../src/run/actions/runChildCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runDelegationsLoad } from "../src/run/actions/runDelegationsLoad.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)

afterAll(async () => {
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("loads only authorized session delegations in createdAt/id order", async () => {
  const userId = `delegation-load-user-${uuidv7()}`
  const organizationId = `delegation-load-organization-${uuidv7()}`
  const serverId = `delegation-load-server-${uuidv7()}`
  const agentId = `delegation-load-agent-${uuidv7()}`
  const sessionId = `delegation-load-session-${uuidv7()}`

  try {
    await database.insert(applicationUserTable).values({ displayName: "Delegation Load User", id: userId })
    await database.insert(organizationTable).values({
      externalId: organizationId,
      id: organizationId,
      name: "Delegation Load Organization",
    })
    await database.insert(serverTable).values({
      endpoint: "http://delegation-load.test",
      id: serverId,
      name: "Delegation Load Server",
      organizationId,
    })
    await database.insert(agentTable).values({ id: agentId, name: "Delegation Load Agent", role: "coding", serverId })
    await database.insert(sessionTable).values({
      clientRequestId: uuidv7(),
      id: sessionId,
      metadata: {},
      primaryAgentId: agentId,
      serverId,
      title: "Delegation Load Session",
      userId,
    })

    const snapshot = {
      configuration: { model: "delegation-load-model", provider: "deterministic" as const },
      configurationRevision: "delegation-load-revision",
      target: { agentId, serverId },
    }
    const budget = { maxChildDepth: 1, maxChildRuns: 2, maxDurationMs: 10_000 }
    const parent = await runCreate(database, userId, sessionId, {
      budget,
      clientRunId: `delegation-load-parent-${uuidv7()}`,
      snapshot,
      streamId: `delegation-load-parent-stream-${uuidv7()}`,
    })
    expect(parent.success).toBe(true)
    if (!parent.success) return
    expect(await runTransition(database, userId, sessionId, parent.data.run.id, { status: "running" })).toMatchObject({
      success: true,
    })

    const childInputs = ["first", "second"].map((key) => ({
      delegationKey: `delegation-${key}`,
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: `Perform the ${key} delegated task.`,
    }))
    const children: Array<Awaited<ReturnType<typeof runChildCreate>>> = []
    for (const input of childInputs) children.push(await runChildCreate(database, userId, sessionId, input))
    const successfulChildren = children.filter(
      (child): child is Extract<(typeof children)[number], { success: true }> => child.success,
    )
    expect(successfulChildren).toHaveLength(childInputs.length)
    if (successfulChildren.length !== childInputs.length) return

    const sameCreatedAt = new Date("2026-08-23T00:00:00.000Z")
    for (const child of successfulChildren) {
      await database
        .update(runDelegationTable)
        .set({ createdAt: sameCreatedAt, updatedAt: sameCreatedAt })
        .where(eq(runDelegationTable.id, child.data.delegation.id))
    }

    const loaded = await runDelegationsLoad(database, userId, organizationId, sessionId)
    expect(loaded.success).toBe(true)
    if (!loaded.success) return
    expect(loaded.data.revision).toBe(3)
    const expected = successfulChildren
      .map((child) => child.data.delegation)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((delegation) => ({
        // The load joins the child run so the UI can label the delegation's target agent.
        childAgentId: agentId,
        childSessionId: null,
        childRunId: delegation.childRunId,
        delegationKey: delegation.delegationKey,
        id: delegation.id,
        parentAttemptId: delegation.parentAttemptId,
        parentRunId: delegation.parentRunId,
        parentSessionId: sessionId,
        task: delegation.task,
      }))
    expect(loaded.data.delegations).toEqual(expected)
    expect(await runDelegationsLoad(database, "delegation-load-other-user", organizationId, sessionId)).toMatchObject({
      errorMessage: "The session could not be found.",
      success: false,
    })
    expect(await runDelegationsLoad(database, userId, "delegation-load-other-organization", sessionId)).toMatchObject({
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
})
