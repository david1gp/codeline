import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { runChildCreate } from "../src/run/actions/runChildCreate.js"
import { runDelegationFinalize } from "../src/run/actions/runDelegationFinalize.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runProviderOutputCreate } from "../src/run/actions/runProviderOutputCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { runRepositoryActiveSnapshotLoad } from "../src/run/db/runRepositoryActiveSnapshotLoad.js"
import { runActiveStateTable } from "../src/run/db/runActiveStateTable.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { runFinalizedDetailTable } from "../src/run/db/runFinalizedDetailTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionHistoryEntryRepositoryUpsert } from "../src/session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionHistoryEntryTable } from "../src/session/db/sessionHistoryEntryTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-run-history-projection."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: `run-history-agent-${uuidv7()}`,
  organizationId: `run-history-organization-${uuidv7()}`,
  serverId: `run-history-server-${uuidv7()}`,
  userId: `run-history-user-${uuidv7()}`,
}
const cursorCodecResult = journalCursorCodecCreate({ randomBytes, secret: `run-history-secret-${uuidv7()}` })
if (!cursorCodecResult.success) throw new Error(cursorCodecResult.errorMessage)
const cursorCodec = cursorCodecResult.data
const scheduler = {
  clearTimeout: () => undefined,
  setTimeout: () => 1,
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values({ displayName: fixture.userId, id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: fixture.organizationId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://run-history-projection.test",
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
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

async function sessionCreate(label: string): Promise<string> {
  const sessionId = `run-history-session-${label}-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: `run-history-request-${sessionId}`,
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: `Run history ${label}`,
    userId: fixture.userId,
  })
  return sessionId
}

function runInput(label: string) {
  return {
    budget: { maxDurationMs: 10_000 },
    clientRunId: `run-history-client-${label}-${uuidv7()}`,
    snapshot: {
      configuration: { model: "deterministic-model", provider: "deterministic" as const },
      configurationRevision: "run-history-revision",
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId: `run-history-stream-${label}-${uuidv7()}`,
  }
}

function providerCreate(runId: string, sessionId: string) {
  const postCommitPublish = async () => createResult(undefined)
  return runProviderOutputCreate({
    database,
    journalPostCommitPublish: postCommitPublish,
    requestId: `run-history-request-${runId}`,
    runId,
    scheduler,
    sessionId,
    userId: fixture.userId,
  })
}

async function createRun(label: string) {
  const sessionId = await sessionCreate(label)
  const input = runInput(label)
  const created = await runCreate(database, fixture.userId, sessionId, input)
  expect(created.success).toBe(true)
  if (!created.success) throw new Error(created.errorMessage)
  return { input, runId: created.data.run.id, sessionId }
}

async function createDelegatableParent(label: string) {
  const sessionId = await sessionCreate(label)
  const input = {
    ...runInput(label),
    budget: { maxChildDepth: 1, maxChildRuns: 2, maxDurationMs: 10_000 },
  }
  const created = await runCreate(database, fixture.userId, sessionId, input)
  expect(created.success).toBe(true)
  if (!created.success) throw new Error(created.errorMessage)
  const started = await runTransition(database, fixture.userId, sessionId, created.data.run.id, { status: "running" })
  expect(started).toMatchObject({ success: true })
  return { attemptId: created.data.attempt.id, runId: created.data.run.id, sessionId }
}

test("creates one run summary and bounded active state in the run transaction", async () => {
  const { input, runId, sessionId } = await createRun("create")
  const repeated = await runCreate(database, fixture.userId, sessionId, input)
  expect(repeated).toMatchObject({ data: { created: false, run: { id: runId } }, success: true })

  const entries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, sessionId))
    .orderBy(asc(sessionHistoryEntryTable.position))
  expect(entries).toHaveLength(1)
  expect(entries[0]).toMatchObject({
    kind: "run",
    payload: { detailId: runId, id: runId, kind: "run", status: "accepted", summary: "Run accepted" },
    sourceId: runId,
    sourceType: "run",
  })

  const [activeState] = await database.select().from(runActiveStateTable).where(eq(runActiveStateTable.runId, runId))
  expect(activeState).toMatchObject({
    changePosition: 2,
    lastSequence: 0,
    partialText: "",
    sessionId,
    status: "accepted",
    userId: fixture.userId,
  })
})

test("updates one stable tool projection from repeated tool deltas", async () => {
  const { runId, sessionId } = await createRun("tool")
  const provider = providerCreate(runId, sessionId)
  const started = await provider.start()
  expect(started.success).toBe(true)

  const toolCallId = "run-history-tool-call"
  expect(await provider.append({ toolCallId, toolCallName: "bash", type: "TOOL_CALL_START" })).toMatchObject({
    success: true,
  })
  await provider.flush()
  expect(await provider.append({ output: "first output", toolCallId, type: "TOOL_CALL_END" })).toMatchObject({
    success: true,
  })
  await provider.flush()
  const [firstOutputEntry] = await database
    .select({ changePosition: sessionHistoryEntryTable.changePosition })
    .from(sessionHistoryEntryTable)
    .where(
      and(
        eq(sessionHistoryEntryTable.sessionId, sessionId),
        eq(sessionHistoryEntryTable.sourceType, "tool"),
        eq(sessionHistoryEntryTable.sourceId, runId),
        eq(sessionHistoryEntryTable.sourceDetailId, toolCallId),
      ),
    )
  expect(await provider.append({ output: "first output", toolCallId, type: "TOOL_CALL_END" })).toMatchObject({
    success: true,
  })
  await provider.flush()
  const [repeatedOutputEntry] = await database
    .select({ changePosition: sessionHistoryEntryTable.changePosition })
    .from(sessionHistoryEntryTable)
    .where(
      and(
        eq(sessionHistoryEntryTable.sessionId, sessionId),
        eq(sessionHistoryEntryTable.sourceType, "tool"),
        eq(sessionHistoryEntryTable.sourceId, runId),
        eq(sessionHistoryEntryTable.sourceDetailId, toolCallId),
      ),
    )
  expect(repeatedOutputEntry?.changePosition).toBe(firstOutputEntry?.changePosition)
  expect(await provider.append({ output: "second output", toolCallId, type: "TOOL_CALL_END" })).toMatchObject({
    success: true,
  })
  await provider.flush()
  expect(
    await provider.append({ content: "finished", state: "output-available", toolCallId, type: "TOOL_CALL_RESULT" }),
  ).toMatchObject({ success: true })
  await provider.flush()

  const entries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, sessionId))
    .orderBy(asc(sessionHistoryEntryTable.position))
  const toolEntries = entries.filter((entry) => entry.sourceType === "tool")
  expect(toolEntries).toHaveLength(1)
  expect(toolEntries[0]).toMatchObject({
    kind: "tool",
    payload: {
      detailId: expect.any(String),
      kind: "tool",
      outcome: "success",
      outputAvailable: true,
      resultAvailable: true,
      runId,
      summary: "bash · success",
      toolCallId,
      toolName: "bash",
    },
    sourceDetailId: toolCallId,
    sourceId: runId,
    sourceType: "tool",
  })
  expect(toolEntries[0]?.changePosition).toBeGreaterThan(toolEntries[0]?.position ?? 0)
  expect(new Set(toolEntries.map((entry) => entry.id)).size).toBe(1)
})

test("rolls back a tool delta projection and active-state update together", async () => {
  const { runId, sessionId } = await createRun("tool-rollback")
  const provider = providerCreate(runId, sessionId)
  expect(await provider.start()).toMatchObject({ success: true })
  const [beforeActiveState] = await database
    .select()
    .from(runActiveStateTable)
    .where(eq(runActiveStateTable.runId, runId))
  if (beforeActiveState === undefined) return
  await database
    .update(sessionTable)
    .set({ nextHistoryPosition: Number.MAX_SAFE_INTEGER - 1 })
    .where(eq(sessionTable.id, sessionId))

  expect(
    await provider.append({ eventType: "tool_start", payload: { toolCallId: "tool-rollback-call", toolName: "bash" } }),
  ).toMatchObject({ success: false })
  expect(
    await database
      .select()
      .from(journalEventTable)
      .where(and(eq(journalEventTable.runId, runId), eq(journalEventTable.eventType, "delta"))),
  ).toHaveLength(0)
  expect(
    await database
      .select()
      .from(sessionHistoryEntryTable)
      .where(
        and(
          eq(sessionHistoryEntryTable.sessionId, sessionId),
          eq(sessionHistoryEntryTable.sourceType, "tool"),
          eq(sessionHistoryEntryTable.sourceId, runId),
        ),
      ),
  ).toHaveLength(0)
  expect(await database.select().from(runActiveStateTable).where(eq(runActiveStateTable.runId, runId))).toEqual([
    beforeActiveState,
  ])
  const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, sessionId))
  expect(session?.nextHistoryPosition).toBe(Number.MAX_SAFE_INTEGER - 1)
})

test("keeps active state bounded and loads it without folding deltas", async () => {
  const { runId, sessionId } = await createRun("active")
  const provider = providerCreate(runId, sessionId)
  expect(await provider.start()).toMatchObject({ success: true })
  const oversized = "x".repeat(20_000)
  expect(await provider.append({ delta: oversized, type: "TEXT_MESSAGE_CONTENT" })).toMatchObject({ success: true })
  expect(await provider.flush()).toMatchObject({ success: true })

  const [activeState] = await database.select().from(runActiveStateTable).where(eq(runActiveStateTable.runId, runId))
  expect(activeState).toMatchObject({
    lastSequence: expect.any(Number),
    partialText: "x".repeat(16_384),
    status: "running",
  })

  const [delta] = await database
    .select({ id: journalEventTable.id })
    .from(journalEventTable)
    .where(and(eq(journalEventTable.runId, runId), eq(journalEventTable.eventType, "delta")))
    .limit(1)
  if (delta !== undefined) {
    await database
      .update(journalEventTable)
      .set({ payload: { invalid: true } })
      .where(eq(journalEventTable.id, delta.id))
  }
  const snapshot = await runRepositoryActiveSnapshotLoad(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
    runId,
  )
  expect(snapshot).toMatchObject({
    success: true,
    data: { lastSequence: activeState?.lastSequence, partialText: "x".repeat(16_384), status: "running" },
  })
})

test("attaches child delegation identity to an existing stable tool entry", async () => {
  const parent = await createDelegatableParent("delegation-existing-tool")
  const delegationKey = "delegation-existing-tool-call"
  const seeded = await databaseTransactionRun(database, (transaction) =>
    sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, parent.sessionId, {
      id: "delegation-existing-stable-tool-entry",
      kind: "tool",
      payload: {
        detailId: delegationKey,
        id: "delegation-existing-stable-tool-entry",
        kind: "tool",
        runId: parent.runId,
        sequence: 7,
        summary: "delegate_task · running",
        toolCallId: delegationKey,
        toolName: "delegate_task",
      },
      sourceDetailId: delegationKey,
      sourceId: parent.runId,
      sourceType: "tool",
    }),
  )
  expect(seeded).toMatchObject({ success: true, data: { created: true } })
  if (!seeded.success) return

  const childInput = {
    delegationKey,
    parentAttemptId: parent.attemptId,
    parentRunId: parent.runId,
    task: "Attach the child identity to the existing tool entry.",
  }
  const child = await runChildCreate(database, fixture.userId, parent.sessionId, childInput)
  expect(child).toMatchObject({ success: true, data: { created: true } })
  if (!child.success) return
  const replay = await runChildCreate(database, fixture.userId, parent.sessionId, childInput)
  expect(replay).toMatchObject({
    success: true,
    data: { created: false, delegation: { id: child.data.delegation.id } },
  })

  const entries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, parent.sessionId))
    .orderBy(asc(sessionHistoryEntryTable.position))
  const toolEntries = entries.filter((entry) => entry.sourceType === "tool")
  expect(toolEntries).toHaveLength(1)
  expect(entries.filter((entry) => entry.sourceType === "run")).toContainEqual(
    expect.objectContaining({
      payload: expect.objectContaining({ status: "accepted" }),
      sourceId: child.data.run.id,
      sourceType: "run",
    }),
  )
  expect(
    await database.select().from(runActiveStateTable).where(eq(runActiveStateTable.runId, child.data.run.id)),
  ).toMatchObject([{ status: "accepted" }])
  expect(toolEntries[0]).toMatchObject({
    id: seeded.data.entry.id,
    payload: {
      childRunId: child.data.run.id,
      delegationId: child.data.delegation.id,
      delegationStatus: "accepted",
      parentSessionId: parent.sessionId,
      sequence: 7,
    },
    position: seeded.data.entry.position,
  })
})

test("creates one stable delegation tool entry when the tool was not projected yet", async () => {
  const parent = await createDelegatableParent("delegation-missing-tool")
  const childInput = {
    delegationKey: "delegation-missing-tool-call",
    parentAttemptId: parent.attemptId,
    parentRunId: parent.runId,
    task: "Create the missing stable delegation tool entry.",
  }
  const child = await runChildCreate(database, fixture.userId, parent.sessionId, childInput)
  expect(child).toMatchObject({ success: true, data: { created: true } })
  if (!child.success) return
  const firstEntries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, parent.sessionId))
  const firstToolEntries = firstEntries.filter((entry) => entry.sourceType === "tool")
  expect(firstToolEntries).toHaveLength(1)
  const firstToolEntry = firstToolEntries[0]
  if (firstToolEntry === undefined) return

  const replay = await runChildCreate(database, fixture.userId, parent.sessionId, childInput)
  expect(replay).toMatchObject({ success: true, data: { created: false } })
  const repeatedEntries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, parent.sessionId))
  expect(repeatedEntries.filter((entry) => entry.sourceType === "tool")).toHaveLength(1)
  const [repeatedToolEntry] = repeatedEntries.filter((entry) => entry.sourceType === "tool")
  expect(repeatedToolEntry).toEqual(firstToolEntry)
})

test("repairs the stable delegation tool entry when an equivalent child is reused", async () => {
  const parent = await createDelegatableParent("delegation-equivalent-reuse")
  const childInput = {
    delegationKey: "delegation-equivalent-original-call",
    parentAttemptId: parent.attemptId,
    parentRunId: parent.runId,
    task: "Reuse the equivalent child delegation.",
  }
  const child = await runChildCreate(database, fixture.userId, parent.sessionId, childInput)
  expect(child).toMatchObject({ success: true, data: { created: true } })
  if (!child.success) return

  await database
    .delete(sessionHistoryEntryTable)
    .where(
      and(
        eq(sessionHistoryEntryTable.sessionId, parent.sessionId),
        eq(sessionHistoryEntryTable.sourceType, "tool"),
        eq(sessionHistoryEntryTable.sourceId, parent.runId),
        eq(sessionHistoryEntryTable.sourceDetailId, childInput.delegationKey),
      ),
    )
  const reused = await runChildCreate(database, fixture.userId, parent.sessionId, {
    ...childInput,
    delegationKey: "delegation-equivalent-retry-call",
  })
  expect(reused).toMatchObject({
    success: true,
    data: { created: false, delegation: { id: child.data.delegation.id }, run: { id: child.data.run.id } },
  })

  const entries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, parent.sessionId))
  const toolEntries = entries.filter((entry) => entry.sourceType === "tool")
  expect(toolEntries).toHaveLength(1)
  expect(toolEntries[0]).toMatchObject({
    payload: {
      childRunId: child.data.run.id,
      delegationId: child.data.delegation.id,
      parentSessionId: parent.sessionId,
    },
    sourceDetailId: childInput.delegationKey,
  })
})

test("updates the stable delegation tool entry on child finalization and leaves retries unchanged", async () => {
  const parent = await createDelegatableParent("delegation-finalization")
  const child = await runChildCreate(database, fixture.userId, parent.sessionId, {
    delegationKey: "delegation-finalization-call",
    parentAttemptId: parent.attemptId,
    parentRunId: parent.runId,
    task: "Finalize the child and update its parent tool entry.",
  })
  expect(child).toMatchObject({ success: true, data: { created: true } })
  if (!child.success) return
  expect(
    await runTransition(database, fixture.userId, parent.sessionId, child.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  const [before] = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(
      and(
        eq(sessionHistoryEntryTable.sessionId, parent.sessionId),
        eq(sessionHistoryEntryTable.sourceType, "tool"),
        eq(sessionHistoryEntryTable.sourceId, parent.runId),
        eq(sessionHistoryEntryTable.sourceDetailId, "delegation-finalization-call"),
      ),
    )
  if (before === undefined) return
  const result = { status: "succeeded" as const, text: "The child finished." }
  const finalized = await runDelegationFinalize(
    database,
    fixture.userId,
    parent.sessionId,
    child.data.delegation.id,
    result,
  )
  expect(finalized).toMatchObject({ success: true, data: { changed: true } })
  const [after] = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(
      and(
        eq(sessionHistoryEntryTable.sessionId, parent.sessionId),
        eq(sessionHistoryEntryTable.sourceType, "tool"),
        eq(sessionHistoryEntryTable.sourceId, parent.runId),
        eq(sessionHistoryEntryTable.sourceDetailId, "delegation-finalization-call"),
      ),
    )
  if (after === undefined) return
  expect(after).toMatchObject({
    id: before.id,
    payload: {
      childRunId: child.data.run.id,
      delegationId: child.data.delegation.id,
      delegationStatus: "succeeded",
      parentSessionId: parent.sessionId,
    },
    position: before.position,
  })
  expect(
    await database
      .select({ payload: sessionHistoryEntryTable.payload })
      .from(sessionHistoryEntryTable)
      .where(
        and(
          eq(sessionHistoryEntryTable.sessionId, parent.sessionId),
          eq(sessionHistoryEntryTable.sourceType, "run"),
          eq(sessionHistoryEntryTable.sourceId, child.data.run.id),
        ),
      ),
  ).toMatchObject([{ payload: { status: "succeeded", terminalKind: "completed" } }])
  expect(after.changePosition).toBeGreaterThan(before.changePosition)

  expect(
    await runDelegationFinalize(database, fixture.userId, parent.sessionId, child.data.delegation.id, result),
  ).toMatchObject({ success: true, data: { changed: false } })
  const [repeated] = await database
    .select({ changePosition: sessionHistoryEntryTable.changePosition, id: sessionHistoryEntryTable.id })
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.id, after.id))
  expect(repeated).toEqual({ changePosition: after.changePosition, id: after.id })
})

test("rolls back child delegation creation when its stable tool entry cannot be allocated", async () => {
  const parent = await createDelegatableParent("delegation-creation-rollback")
  await database
    .update(sessionTable)
    .set({ nextHistoryPosition: Number.MAX_SAFE_INTEGER - 2 })
    .where(eq(sessionTable.id, parent.sessionId))

  const created = await runChildCreate(database, fixture.userId, parent.sessionId, {
    delegationKey: "delegation-creation-rollback-call",
    parentAttemptId: parent.attemptId,
    parentRunId: parent.runId,
    task: "This child must roll back with its projection.",
  })
  expect(created).toMatchObject({ success: false })
  expect(
    await database.select().from(runDelegationTable).where(eq(runDelegationTable.sessionId, parent.sessionId)),
  ).toHaveLength(0)
  expect(await database.select().from(runTable).where(eq(runTable.sessionId, parent.sessionId))).toHaveLength(1)
  expect(await database.select().from(attemptTable).where(eq(attemptTable.sessionId, parent.sessionId))).toHaveLength(1)
  expect(
    await database.select().from(runActiveStateTable).where(eq(runActiveStateTable.sessionId, parent.sessionId)),
  ).toHaveLength(1)
  expect(
    await database
      .select()
      .from(sessionHistoryEntryTable)
      .where(eq(sessionHistoryEntryTable.sessionId, parent.sessionId)),
  ).toHaveLength(1)
  const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, parent.sessionId))
  expect(session?.nextHistoryPosition).toBe(Number.MAX_SAFE_INTEGER - 2)
})

test("rolls back child finalization when its stable tool entry update cannot be allocated", async () => {
  const parent = await createDelegatableParent("delegation-finalization-rollback")
  const child = await runChildCreate(database, fixture.userId, parent.sessionId, {
    delegationKey: "delegation-finalization-rollback-call",
    parentAttemptId: parent.attemptId,
    parentRunId: parent.runId,
    task: "This child finalization must roll back with its projection.",
  })
  expect(child).toMatchObject({ success: true, data: { created: true } })
  if (!child.success) return
  expect(
    await runTransition(database, fixture.userId, parent.sessionId, child.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  const [beforeTool] = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sourceDetailId, "delegation-finalization-rollback-call"))
  const [beforeRun] = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(
      and(
        eq(sessionHistoryEntryTable.sessionId, parent.sessionId),
        eq(sessionHistoryEntryTable.sourceType, "run"),
        eq(sessionHistoryEntryTable.sourceId, child.data.run.id),
      ),
    )
  const [beforeActiveState] = await database
    .select()
    .from(runActiveStateTable)
    .where(eq(runActiveStateTable.runId, child.data.run.id))
  if (beforeRun === undefined || beforeActiveState === undefined) return
  await database
    .update(sessionTable)
    .set({ nextHistoryPosition: Number.MAX_SAFE_INTEGER - 1 })
    .where(eq(sessionTable.id, parent.sessionId))

  const finalized = await runDelegationFinalize(database, fixture.userId, parent.sessionId, child.data.delegation.id, {
    status: "succeeded",
    text: "This result must not commit.",
  })
  expect(finalized).toMatchObject({ success: false })
  const [run] = await database.select().from(runTable).where(eq(runTable.id, child.data.run.id))
  const [attempt] = await database.select().from(attemptTable).where(eq(attemptTable.id, child.data.attempt.id))
  const [delegation] = await database
    .select()
    .from(runDelegationTable)
    .where(eq(runDelegationTable.id, child.data.delegation.id))
  const [tool] = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.id, beforeTool?.id ?? ""))
  expect(run).toMatchObject({ status: "running", failure: null, finishedAt: null })
  expect(attempt).toMatchObject({ status: "running", failure: null, finishedAt: null })
  expect(delegation?.finalizedResult).toBeNull()
  expect(tool).toEqual(beforeTool)
  const [runHistory] = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.id, beforeRun?.id ?? ""))
  expect(runHistory).toEqual(beforeRun)
  expect(
    await database.select().from(runActiveStateTable).where(eq(runActiveStateTable.runId, child.data.run.id)),
  ).toEqual([beforeActiveState])
  expect(
    await database.select().from(runFinalizedDetailTable).where(eq(runFinalizedDetailTable.runId, child.data.run.id)),
  ).toHaveLength(0)
  const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, parent.sessionId))
  expect(session?.nextHistoryPosition).toBe(Number.MAX_SAFE_INTEGER - 1)
})

test("rolls back canonical run, projection, and active state writes together", async () => {
  const sessionId = await sessionCreate("rollback")
  await database
    .update(sessionTable)
    .set({ nextHistoryPosition: Number.MAX_SAFE_INTEGER })
    .where(eq(sessionTable.id, sessionId))

  const created = await runCreate(database, fixture.userId, sessionId, runInput("rollback"))
  expect(created).toMatchObject({ success: false })
  expect(await database.select().from(runTable).where(eq(runTable.sessionId, sessionId))).toHaveLength(0)
  expect(
    await database.select().from(sessionHistoryEntryTable).where(eq(sessionHistoryEntryTable.sessionId, sessionId)),
  ).toHaveLength(0)
  expect(
    await database.select().from(runActiveStateTable).where(eq(runActiveStateTable.sessionId, sessionId)),
  ).toHaveLength(0)

  const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, sessionId))
  expect(session?.nextHistoryPosition).toBe(Number.MAX_SAFE_INTEGER)
})
