import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { agentTable } from "../src/agents/db/agentTable.js"
import { sessionCompactionGenerate } from "../src/compaction/actions/sessionCompactionGenerate.js"
import { sessionCompactionContextReconstruct } from "../src/compaction/actions/sessionCompactionContextReconstruct.js"
import { sessionCompactionTable } from "../src/compaction/db/sessionCompactionTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import type { CliProxyApiAdapter, CliProxyApiAdapterInput } from "../src/providers/runtime/cliProxyApiAdapterCreate.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-session-compaction-generate."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: "session-compaction-generate-agent",
  organizationId: "session-compaction-generate-organization",
  serverId: "session-compaction-generate-server",
  userId: "session-compaction-generate-user",
}

async function sessionCreate(sessionId: string, messages: readonly string[]): Promise<void> {
  await database.insert(sessionTable).values({
    clientRequestId: `${sessionId}-request`,
    id: sessionId,
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: sessionId,
    userId: fixture.userId,
  })
  await database.insert(messageTable).values(
    messages.map((content, index) => ({
      agentId: fixture.agentId,
      clientRequestId: `${sessionId}-message-${index + 1}`,
      content,
      id: `${sessionId}-message-${index + 1}`,
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      sequence: index + 1,
      sessionId,
    })),
  )
}

function streamCreate(chunks: readonly StreamChunk[], onStart?: (input: CliProxyApiAdapterInput) => Promise<void>) {
  return ((input: CliProxyApiAdapterInput) =>
    (async function* () {
      await onStart?.(input)
      for (const chunk of chunks) yield chunk
    })()) as CliProxyApiAdapter
}

function completedText(text: string, finishReason: "stop" | "length" = "stop"): StreamChunk[] {
  return [
    { runId: "run", threadId: "session", timestamp: 1, type: EventType.RUN_STARTED },
    { delta: text, messageId: "message", timestamp: 2, type: EventType.TEXT_MESSAGE_CONTENT },
    {
      finishReason,
      outcome: { type: "success" },
      runId: "run",
      threadId: "session",
      timestamp: 3,
      type: EventType.RUN_FINISHED,
    },
  ] as StreamChunk[]
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values({ displayName: "Compaction Generate User", id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: "Compaction Generate Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-compaction-generate.test",
    id: fixture.serverId,
    name: "Compaction Generate Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    configuration: { model: "test-model", provider: "deterministic" },
    id: fixture.agentId,
    name: "Compaction Generate Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

test("generates a bounded summary and returns coverage and tail metadata", async () => {
  const sessionId = "session-compaction-generate-success"
  await sessionCreate(sessionId, ["old goal", "recent context"])
  let observed: CliProxyApiAdapterInput | undefined
  const result = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate(completedText("## Goals\n- Keep the goal."), async (input) => {
      observed = input
    }),
    id: "compaction-generate-success",
    policy: { recentTokenBudget: 1 },
  })

  expect(result).toMatchObject({
    success: true,
    data: {
      compaction: { coveredSequence: 1, status: "succeeded" },
      coverage: { firstSequence: 1, lastSequence: 1, messageCount: 1 },
      tail: { firstSequence: 2, lastSequence: 2, messageCount: 1 },
    },
  })
  expect(observed).toMatchObject({ history: [], tools: [] })
  expect(observed?.prompt).toContain('"content":"old goal"')
})

test("uses the admitted runtime configuration for summary generation", async () => {
  const sessionId = "session-compaction-generate-effective-configuration"
  await sessionCreate(sessionId, ["old goal", "recent context"])
  let observedModel: string | undefined
  const result = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    id: "compaction-generate-effective-configuration",
    policy: { recentTokenBudget: 1 },
    runtimeAdapterCreate: ({ configuration }) => {
      observedModel = configuration.model
      return streamCreate(completedText("effective summary"))
    },
    runtimeConfiguration: { model: "admitted-model", provider: "deterministic" },
  })

  expect(result.success).toBe(true)
  expect(observedModel).toBe("admitted-model")
})

test("updates a prior summary without losing it from the rolling prompt", async () => {
  const sessionId = "session-compaction-generate-update"
  await sessionCreate(sessionId, ["old goal", "old context"])
  const first = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate(completedText("first summary")),
    id: "compaction-generate-update-one",
    policy: { recentTokenBudget: 1 },
  })
  expect(first.success).toBe(true)
  await messageAppend(database, fixture.userId, sessionId, {
    clientRequestId: "session-compaction-generate-update-new-one",
    content: "new goal",
    role: "user",
  })
  await messageAppend(database, fixture.userId, sessionId, {
    clientRequestId: "session-compaction-generate-update-new-two",
    content: "new context",
    role: "assistant",
  })
  let prompt = ""
  const second = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate(completedText("updated summary"), async (input) => {
      prompt = input.prompt
    }),
    id: "compaction-generate-update-two",
    policy: { recentTokenBudget: 1 },
  })

  expect(second).toMatchObject({
    success: true,
    data: { compaction: { compactionVersion: 2, coveredSequence: 3, summary: "updated summary" } },
  })
  expect(prompt).toContain("first summary")
  expect(prompt).toContain("new goal")
})

test("finalizes an empty provider result as a failure", async () => {
  const sessionId = "session-compaction-generate-empty"
  await sessionCreate(sessionId, ["old goal", "recent context"])
  const result = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate(completedText("")),
    id: "compaction-generate-empty",
    policy: { recentTokenBudget: 1 },
  })

  expect(result).toMatchObject({ errorMessage: "The compaction provider returned empty text.", success: false })
  expect(await database.select().from(sessionCompactionTable)).toContainEqual(
    expect.objectContaining({ id: "compaction-generate-empty", status: "failed" }),
  )
})

test("rejects provider tool calls", async () => {
  const sessionId = "session-compaction-generate-tool"
  await sessionCreate(sessionId, ["old goal", "recent context"])
  const result = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate([
      { timestamp: 1, toolCallId: "tool-1", toolCallName: "read", toolName: "read", type: EventType.TOOL_CALL_START },
    ] as StreamChunk[]),
    id: "compaction-generate-tool",
    policy: { recentTokenBudget: 1 },
  })

  expect(result).toMatchObject({ errorMessage: "The compaction provider attempted to use a tool.", success: false })
})

test("rejects length-truncated summaries", async () => {
  const sessionId = "session-compaction-generate-truncated"
  await sessionCreate(sessionId, ["old goal", "recent context"])
  const result = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate(completedText("partial summary", "length")),
    id: "compaction-generate-truncated",
    policy: { recentTokenBudget: 1 },
  })

  expect(result).toMatchObject({
    errorMessage: "The compaction provider truncated the summary at its output limit.",
    success: false,
  })
})

test("finalizes provider errors as failures", async () => {
  const sessionId = "session-compaction-generate-provider-error"
  await sessionCreate(sessionId, ["old goal", "recent context"])
  const result = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate([
      { code: "provider_failed", message: "Provider failed.", timestamp: 1, type: EventType.RUN_ERROR },
    ] as StreamChunk[]),
    id: "compaction-generate-provider-error",
    policy: { recentTokenBudget: 1 },
  })

  expect(result).toMatchObject({ errorMessage: "Provider failed.", success: false })
})

test("rejects an aborted compaction without activating a summary", async () => {
  const sessionId = "session-compaction-generate-abort"
  await sessionCreate(sessionId, ["old goal", "recent context"])
  const controller = new AbortController()
  controller.abort()
  const result = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate(completedText("must not be used")),
    id: "compaction-generate-abort",
    policy: { recentTokenBudget: 1 },
    signal: controller.signal,
  })

  expect(result).toMatchObject({ errorMessage: "The compaction was aborted.", success: false })
  expect(await database.select().from(sessionCompactionTable)).toContainEqual(
    expect.objectContaining({ id: "compaction-generate-abort", status: "failed", summary: null }),
  )
})

test("rejects generation when the session changes during summary generation", async () => {
  const sessionId = "session-compaction-generate-concurrent"
  await sessionCreate(sessionId, ["old goal", "recent context"])
  const result = await sessionCompactionGenerate(database, fixture.userId, fixture.organizationId, sessionId, {
    adapter: streamCreate(completedText("summary"), async () => {
      const appended = await messageAppend(database, fixture.userId, sessionId, {
        clientRequestId: "session-compaction-generate-concurrent-message",
        content: "concurrent context",
        role: "user",
      })
      if (!appended.success) throw new Error(appended.errorMessage)
    }),
    id: "compaction-generate-concurrent",
    policy: { recentTokenBudget: 1 },
  })
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )

  expect(result).toMatchObject({ success: false, errorMessage: "The session changed during compaction." })
  expect(reconstructed).toMatchObject({
    success: true,
    data: { compaction: undefined, history: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }] },
  })
})
