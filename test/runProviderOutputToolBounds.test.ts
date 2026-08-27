import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { asc, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalPostCommitPublishCreate } from "../src/journal/actions/journalPostCommitPublishCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runProviderOutputCreate } from "../src/run/actions/runProviderOutputCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import type { StreamSseFrame } from "../src/stream/api/streamSseFrameSchema.js"
import { streamSseFrameSerialize } from "../src/stream/api/streamSseFrameSerialize.js"
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
const cursorCodecResult = journalCursorCodecCreate({
  randomBytes,
  secret: `tool-bounds-secret-${uuidv7()}`,
})

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

function publisherCreate(frames: StreamSseFrame[]) {
  if (!cursorCodecResult.success) throw new Error(cursorCodecResult.errorMessage)
  return journalPostCommitPublishCreate({
    cursorCodec: cursorCodecResult.data,
    liveSubscription: { publish: (_userId, frame) => frames.push(frame) },
  })
}

function providerCreate(runId: string, frames: StreamSseFrame[]) {
  return runProviderOutputCreate({
    database,
    journalPostCommitPublish: publisherCreate(frames),
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

function frameRunId(frame: StreamSseFrame): string | undefined {
  const runId = (frame.data as Record<string, unknown>).runId
  return typeof runId === "string" ? runId : undefined
}

function comparableFrame(frame: StreamSseFrame): { data: Record<string, unknown>; event: string } {
  const { id: _id, ...data } = frame.data as Record<string, unknown>
  return { data, event: frame.event }
}

async function replayFrames(): Promise<StreamSseFrame[]> {
  if (!cursorCodecResult.success) throw new Error(cursorCodecResult.errorMessage)
  const replay = await journalBacklogRead({ cursorCodec: cursorCodecResult.data, database }, { userId: fixture.userId })
  if (!replay.success) throw new Error(replay.errorMessage)
  const frames: StreamSseFrame[] = []
  for await (const page of replay.data.pages) {
    if (!page.success) throw new Error(page.errorMessage)
    frames.push(...page.data)
  }
  return frames
}

test.skipIf(!databaseAvailable)("bounds ordinary provider tool output before journal and SSE publication", async () => {
  const runId = await runningRun("ordinary")
  const published: StreamSseFrame[] = []
  const provider = providerCreate(runId, published)
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
  const deltaFrames = published.filter((frame) => frame.event === "delta")
  expect(persisted).toHaveLength(3)
  expect(deltaFrames).toHaveLength(3)
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
  for (const frame of deltaFrames)
    expect(encoder.encode(streamSseFrameSerialize(frame)).byteLength).toBeLessThanOrEqual(128 * 1024)
})

test.skipIf(!databaseAvailable)("replays bounded tool deltas and keeps cumulative amplification bounded", async () => {
  const runId = await runningRun("amplification")
  const published: StreamSseFrame[] = []
  const provider = providerCreate(runId, published)
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
  const deltaFrames = published.filter((frame) => frame.event === "delta" && frameRunId(frame) === runId)
  const replayed = (await replayFrames()).filter((frame) => frame.event === "delta" && frameRunId(frame) === runId)
  const persistedBytes = persisted.reduce((total, row) => total + row.serializedBytes, 0)
  const publishedBytes = deltaFrames.reduce(
    (total, frame) => total + encoder.encode(streamSseFrameSerialize(frame)).byteLength,
    0,
  )

  expect(notificationBytes).toBeGreaterThan(20_000_000)
  expect(persisted.length).toBe(deltaFrames.length)
  expect(replayed.length).toBe(deltaFrames.length)
  expect(deltaFrames.length).toBeGreaterThan(1)
  expect(deltaFrames.length).toBeLessThan(120)
  expect(persistedBytes).toBeLessThan(notificationBytes / 10)
  expect(publishedBytes).toBeLessThan(notificationBytes / 10)
  expect(replayed.map(comparableFrame)).toEqual(deltaFrames.map(comparableFrame))

  for (const row of persisted) {
    expect(row.serializedBytes).toBeGreaterThan(0)
    expect(encoder.encode(JSON.stringify(row.payload)).byteLength).toBeLessThan(128 * 1024)
    expect(row.payload.delta).toContain("truncated")
    expect(row.payload.delta).toContain("[Earlier output truncated]")
  }
  for (const frame of deltaFrames) {
    expect(encoder.encode(streamSseFrameSerialize(frame)).byteLength).toBeLessThanOrEqual(128 * 1024)
    expect(JSON.stringify(frame.data)).toContain("truncated")
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
    const published: StreamSseFrame[] = []
    const provider = providerCreate(runId, published)
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

    const runFrames = published.filter((frame) => frameRunId(frame) === runId)
    expect(runFrames.map((frame) => frame.event)).toEqual(["delta", "delta", terminalCase.terminalEvent])
    expect(runFrames[0]?.data).toMatchObject({ deltaKind: "tool", runId })
    expect(runFrames[1]?.data).toMatchObject({ deltaKind: "tool", runId })
    expect(runFrames[2]?.data).toMatchObject({ eventType: terminalCase.terminalEvent, runId })
    if (terminalCase.failure !== undefined) expect(runFrames[2]?.data).toMatchObject({ failure: terminalCase.failure })

    const persisted = await runDeltas(runId)
    expect(persisted.map((row) => row.eventType)).toEqual([terminalCase.terminalEvent])
  }
})
