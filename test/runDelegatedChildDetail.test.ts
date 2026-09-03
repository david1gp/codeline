import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { runChildConversationLoad } from "../src/run/actions/runChildConversationLoad.js"
import { runChildCreate } from "../src/run/actions/runChildCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runDelegationFinalize } from "../src/run/actions/runDelegationFinalize.js"
import { runProviderOutputCreate } from "../src/run/actions/runProviderOutputCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runActiveStateTable } from "../src/run/db/runActiveStateTable.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { runFinalizedDetailRepositoryUpsert } from "../src/run/db/runFinalizedDetailRepositoryUpsert.js"
import { runFinalizedDetailTable } from "../src/run/db/runFinalizedDetailTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const prefix = `delegated-child-detail-${uuidv7()}`
const fixture = {
  agentId: `${prefix}-agent`,
  organizationId: `${prefix}-organization`,
  serverId: `${prefix}-server`,
  sessionId: `${prefix}-session`,
  userId: `${prefix}-user`,
}
const snapshot = {
  configuration: { model: "delegated-child-detail-model", provider: "deterministic" as const },
  configurationRevision: `${prefix}-revision`,
  target: { agentId: fixture.agentId, serverId: fixture.serverId },
}
const budget = { maxChildDepth: 1, maxChildRuns: 2, maxDurationMs: 10_000 }
const scheduler = {
  clearTimeout: (_handle: unknown) => undefined,
  setTimeout: (_handler: () => void, _timeoutMs: number) => 1,
}

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(applicationUserTable).values({ displayName: fixture.userId, id: fixture.userId })
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
  await database.insert(sessionTable).values({
    clientRequestId: `${prefix}-request`,
    id: fixture.sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Delegated child detail test",
    userId: fixture.userId,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(sessionTable).where(eq(sessionTable.id, fixture.sessionId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
  }
  await databaseConnectionClose(connection)
})

async function delegatedChildCreate(label: string) {
  const parent = await runCreate(database, fixture.userId, fixture.sessionId, {
    budget,
    clientRunId: `${prefix}-${label}-parent-client-run`,
    snapshot,
    streamId: `${prefix}-${label}-parent-stream`,
  })
  expect(parent).toMatchObject({ success: true })
  if (!parent.success) return
  expect(
    await runTransition(database, fixture.userId, fixture.sessionId, parent.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })

  const child = await runChildCreate(database, fixture.userId, fixture.sessionId, {
    delegationKey: `${prefix}-${label}-delegation-key`,
    parentAttemptId: parent.data.attempt.id,
    parentRunId: parent.data.run.id,
    task: `Run the ${label} delegated detail test.`,
  })
  expect(child).toMatchObject({ success: true, data: { created: true } })
  if (!child.success) return
  expect(
    await runTransition(database, fixture.userId, fixture.sessionId, child.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  return child.data
}

function providerCreate(
  runId: string,
  label: string,
  runFinalizedDetailUpsert?: Parameters<typeof runProviderOutputCreate>[0]["runFinalizedDetailUpsert"],
) {
  return runProviderOutputCreate({
    database,
    journalPostCommitPublish: async () => createResult(undefined),
    ...(runFinalizedDetailUpsert === undefined ? {} : { runFinalizedDetailUpsert }),
    requestId: `${prefix}-${label}-request`,
    runId,
    scheduler,
    sessionId: fixture.sessionId,
    userId: fixture.userId,
  })
}

async function appendToolOutput(provider: ReturnType<typeof runProviderOutputCreate>, toolCallId: string) {
  for (const event of [
    { eventType: "text_delta", payload: { delta: "delegated answer" } },
    { eventType: "tool_start", payload: { toolCallId, toolName: "bash" } },
    { eventType: "tool_output", payload: { output: "tool output", toolCallId, truncated: false } },
    {
      eventType: "tool_result",
      payload: {
        outcome: "success",
        result: "tool result",
        toolCallId,
        truncated: false,
        workingDirectory: "/workspace",
      },
    },
  ]) {
    expect(await provider.append(event)).toMatchObject({ success: true })
  }
}

test.skipIf(!databaseAvailable)(
  "preserves delegated child tool detail through delta deletion and delegation finalization",
  async () => {
    const child = await delegatedChildCreate("survival")
    if (child === undefined) return
    const toolCallId = `${prefix}-survival-tool`
    const provider = providerCreate(child.run.id, "survival")
    await appendToolOutput(provider, toolCallId)

    expect(await provider.finalize({ status: "succeeded" })).toMatchObject({ success: true })
    expect(
      await database
        .select()
        .from(journalEventTable)
        .where(and(eq(journalEventTable.runId, child.run.id), eq(journalEventTable.eventType, "delta"))),
    ).toHaveLength(0)
    const [detailBeforeDelegationFinalize] = await database
      .select()
      .from(runFinalizedDetailTable)
      .where(
        and(
          eq(runFinalizedDetailTable.runId, child.run.id),
          eq(runFinalizedDetailTable.sessionId, fixture.sessionId),
          eq(runFinalizedDetailTable.userId, fixture.userId),
        ),
      )
    expect(detailBeforeDelegationFinalize).toMatchObject({
      runId: child.run.id,
      sessionId: fixture.sessionId,
      tools: [expect.objectContaining({ outcome: "success", result: "tool result", toolCallId, toolName: "bash" })],
      transcript: { assistantText: "delegated answer" },
      userId: fixture.userId,
    })

    let duplicateDetailUpserts = 0
    const finalized = await runDelegationFinalize(
      database,
      fixture.userId,
      fixture.sessionId,
      child.delegation.id,
      { status: "succeeded", text: "delegated answer" },
      {
        runFinalizedDetailUpsert: async () => {
          duplicateDetailUpserts += 1
          return createResultError("failureInjection", "The already persisted detail must not be replaced.")
        },
      },
    )
    expect(finalized).toMatchObject({ success: true, data: { changed: true } })
    expect(duplicateDetailUpserts).toBe(0)

    expect(
      await runChildConversationLoad(
        database,
        fixture.userId,
        fixture.organizationId,
        fixture.sessionId,
        child.run.id,
        child.delegation.id,
      ),
    ).toMatchObject({
      data: { detail: { tools: [expect.objectContaining({ result: "tool result", toolCallId })] }, kind: "finalized" },
      success: true,
    })
  },
)

test.skipIf(!databaseAvailable)(
  "rolls back delegated child finalization and delta deletion when detail persistence fails",
  async () => {
    const child = await delegatedChildCreate("rollback")
    if (child === undefined) return
    const provider = providerCreate(child.run.id, "rollback", async (transaction, userId, sessionId, runId, input) => {
      const persisted = await runFinalizedDetailRepositoryUpsert(transaction, userId, sessionId, runId, input)
      if (!persisted.success) return persisted
      return createResultError("failureInjection", "The delegated child detail persistence failed.")
    })
    await appendToolOutput(provider, `${prefix}-rollback-tool`)

    expect(await provider.finalize({ status: "succeeded" })).toMatchObject({
      errorMessage: "The delegated child detail persistence failed.",
      success: false,
    })
    const [run] = await database.select().from(runTable).where(eq(runTable.id, child.run.id))
    const [attempt] = await database.select().from(attemptTable).where(eq(attemptTable.id, child.attempt.id))
    const [delegation] = await database
      .select()
      .from(runDelegationTable)
      .where(eq(runDelegationTable.id, child.delegation.id))
    expect(run).toMatchObject({ failure: null, finishedAt: null, status: "running" })
    expect(attempt).toMatchObject({ failure: null, finishedAt: null, status: "running" })
    expect(delegation?.finalizedResult).toBeNull()
    expect(
      await database
        .select()
        .from(runActiveStateTable)
        .where(
          and(
            eq(runActiveStateTable.runId, child.run.id),
            eq(runActiveStateTable.sessionId, fixture.sessionId),
            eq(runActiveStateTable.userId, fixture.userId),
          ),
        ),
    ).toHaveLength(1)
    expect(
      await database.select().from(runFinalizedDetailTable).where(eq(runFinalizedDetailTable.runId, child.run.id)),
    ).toHaveLength(0)
    expect(
      await database
        .select()
        .from(journalEventTable)
        .where(and(eq(journalEventTable.runId, child.run.id), eq(journalEventTable.eventType, "delta"))),
    ).not.toHaveLength(0)
  },
)
