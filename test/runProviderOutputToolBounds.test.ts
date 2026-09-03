import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { asc, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runProviderOutputCreate } from "../src/run/actions/runProviderOutputCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

type JournalDeltaRow = {
  eventType: string
  payload: Record<string, unknown>
  sequence: number
  serializedBytes: number
}

type TestScheduler = {
  clearTimeout: (handle: unknown) => void
  setTimeout: (handler: () => void, timeoutMs: number) => unknown
}

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const encoder = new TextEncoder()
const fixture = {
  agentId: `tool-bounds-agent-${uuidv7()}`,
  organizationId: `tool-bounds-organization-${uuidv7()}`,
  serverId: `tool-bounds-server-${uuidv7()}`,
  sessionId: `tool-bounds-session-${uuidv7()}`,
  userId: `tool-bounds-user-${uuidv7()}`,
}

const scheduler: TestScheduler = {
  clearTimeout: () => undefined,
  setTimeout: () => 1,
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
    endpoint: "http://tool-bounds-server.test",
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
    clientRequestId: uuidv7(),
    id: fixture.sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Tool output bounds session",
    userId: fixture.userId,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
  }
  await databaseConnectionClose(connection)
})

function runInput(clientRunId: string, streamId: string) {
  return {
    budget: { maxDurationMs: 10_000 },
    clientRunId,
    snapshot: {
      configuration: { model: "deterministic-model", provider: "deterministic" as const },
      configurationRevision: "configuration-revision-1",
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId,
  }
}

async function runningRun(label: string): Promise<string> {
  const created = await runCreate(
    database,
    fixture.userId,
    fixture.sessionId,
    runInput(`tool-bounds-${label}-${uuidv7()}`, `tool-bounds-stream-${uuidv7()}`),
  )
  if (!created.success) throw new Error(created.errorMessage)
  const transitioned = await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, {
    status: "running",
  })
  if (!transitioned.success) throw new Error(transitioned.errorMessage)
  return created.data.run.id
}

async function postCommitPublish() {
  return createResult(undefined)
}

function providerCreate(runId: string) {
  return runProviderOutputCreate({
    database,
    journalPostCommitPublish: postCommitPublish,
    requestId: `request-${runId}`,
    runId,
    scheduler,
    sessionId: fixture.sessionId,
    userId: fixture.userId,
  })
}

async function runDeltas(runId: string): Promise<JournalDeltaRow[]> {
  const rows = await database
    .select({
      eventType: journalEventTable.eventType,
      payload: journalEventTable.payload,
      sequence: journalEventTable.sequence,
      serializedBytes: journalEventTable.serializedBytes,
    })
    .from(journalEventTable)
    .where(eq(journalEventTable.runId, runId))
    .orderBy(asc(journalEventTable.sequence))
  return rows as unknown as JournalDeltaRow[]
}

test.skipIf(!databaseAvailable)("bounds ordinary provider tool output before journal persistence", async () => {
  const runId = await runningRun("ordinary")
  const provider = providerCreate(runId)
  const oversizedNestedText = `${"discarded-".repeat(2_000)}final-tail`

  expect(
    await provider.append({
      toolCallId: "call-ordinary",
      toolCallName: "bash",
      toolName: "bash",
      type: "TOOL_CALL_START",
    }),
  ).toMatchObject({ success: true })
  expect(
    await provider.append({
      output: {
        raw: { text: oversizedNestedText },
        stdout: "ordinary output",
      },
      toolCallId: "call-ordinary",
      type: "TOOL_CALL_END",
    }),
  ).toMatchObject({ success: true })
  expect(
    await provider.append({
      content: { raw: { result: "ordinary result" }, status: "ok" },
      state: "output-available",
      toolCallId: "call-ordinary",
      type: "TOOL_CALL_RESULT",
      workingDirectory: "/tmp/project",
    }),
  ).toMatchObject({ success: true })
  expect(provider.pendingCount()).toBe(0)

  const persisted = await runDeltas(runId)
  expect(persisted).toHaveLength(3)
  expect(persisted.map((row) => row.eventType)).toEqual(["delta", "delta", "delta"])
  expect(persisted.map((row) => row.serializedBytes)).toEqual(
    expect.arrayContaining([expect.any(Number), expect.any(Number), expect.any(Number)]),
  )

  const outputDelta = JSON.parse(persisted[1]?.payload.delta as string) as {
    output: string
    truncated: boolean
  }
  const output = JSON.parse(outputDelta.output) as { raw: { text: string }; stdout: string }
  const resultDelta = JSON.parse(persisted[2]?.payload.delta as string) as {
    result: string
    truncated: boolean
    workingDirectory: string
  }
  const result = JSON.parse(resultDelta.result) as { raw: { result: string }; status: string }

  expect(outputDelta.truncated).toBe(true)
  expect(output.raw.text.startsWith("[Earlier output truncated]\n\n")).toBe(true)
  expect(output.raw.text.endsWith("final-tail")).toBe(true)
  expect(output.stdout).toBe("ordinary output")
  expect(resultDelta).toMatchObject({ truncated: false, workingDirectory: "/tmp/project" })
  expect(result).toEqual({ raw: { result: "ordinary result" }, status: "ok" })
  for (const row of persisted) expect(encoder.encode(JSON.stringify(row.payload)).byteLength).toBeLessThan(128 * 1024)
})

test.skipIf(!databaseAvailable)("persists bounded tool deltas and keeps cumulative amplification bounded", async () => {
  const runId = await runningRun("amplification")
  const provider = providerCreate(runId)
  const toolCallId = "call-amplification"
  const repeatedPrefix = "P".repeat(20_000)
  let cumulative = repeatedPrefix
  let notificationBytes = 0
  const updateCount = 1_000

  for (let index = 0; index < updateCount; index += 1) {
    cumulative += `\nframe ${index}: ${"#".repeat(40)}`
    const notification = { output: cumulative, toolCallId, type: "tool_output" }
    notificationBytes += encoder.encode(JSON.stringify(notification)).byteLength
    expect(await provider.append(notification)).toMatchObject({ success: true })
  }
  expect(await provider.flush()).toMatchObject({ success: true })

  const persisted = await runDeltas(runId)
  const persistedBytes = persisted.reduce((total, row) => total + row.serializedBytes, 0)

  expect(notificationBytes).toBeGreaterThan(20_000_000)
  expect(persisted.length).toBeGreaterThan(1)
  expect(persisted.length).toBeLessThan(120)
  expect(persistedBytes).toBeLessThan(notificationBytes / 10)

  for (const row of persisted) {
    expect(row.serializedBytes).toBeGreaterThan(0)
    expect(encoder.encode(JSON.stringify(row.payload)).byteLength).toBeLessThan(128 * 1024)
    expect(row.payload.delta).toContain("truncated")
    expect(row.payload.delta).toContain("[Earlier output truncated]")
  }
})

test.skipIf(!databaseAvailable)("flushes pending tool deltas before success and failure terminals", async () => {
  const terminalCases = [
    {
      failure: undefined,
      label: "success",
      status: "succeeded" as const,
      terminalEvent: "run-completed" as const,
    },
    {
      failure: { code: "provider_failed", message: "The provider failed." },
      label: "failure",
      status: "failed" as const,
      terminalEvent: "run-failed" as const,
    },
  ]

  for (const terminalCase of terminalCases) {
    const runId = await runningRun(`terminal-${terminalCase.label}`)
    const provider = providerCreate(runId)
    const common = {
      deltaKind: "tool" as const,
      messageId: "tool-output",
      runId,
      sessionId: fixture.sessionId,
    }

    expect(
      await provider.append({ ...common, delta: JSON.stringify({ output: "first", toolCallId: "call-terminal" }) }),
    ).toMatchObject({
      success: true,
    })
    expect(
      await provider.append({ ...common, delta: JSON.stringify({ output: "second", toolCallId: "call-terminal" }) }),
    ).toMatchObject({
      success: true,
    })
    expect(provider.pendingCount()).toBe(1)

    const finalized = await provider.finalize(
      terminalCase.failure === undefined
        ? { status: terminalCase.status }
        : { failure: terminalCase.failure, status: terminalCase.status },
    )
    expect(finalized).toMatchObject({ success: true })
    expect(provider.pendingCount()).toBe(0)

    const persisted = await runDeltas(runId)
    expect(persisted.map((row) => row.eventType)).toEqual([terminalCase.terminalEvent])
  }
})
