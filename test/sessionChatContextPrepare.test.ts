import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { agentTable } from "../src/agents/db/agentTable.js"
import { sessionCompactionContextReconstruct } from "../src/compaction/actions/sessionCompactionContextReconstruct.js"
import type { CompactionMessage } from "../src/compaction/compactionMessage.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageTable } from "../src/message/db/messageTable.js"
import type { CliProxyApiAdapter, CliProxyApiAdapterInput } from "../src/providers/runtime/cliProxyApiAdapterCreate.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionChatContextPrepare } from "../src/session/actions/sessionChatContextPrepare.js"
import { sessionChatStreamCreate } from "../src/session/actions/sessionChatStreamCreate.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-session-chat-context."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: "session-chat-context-agent",
  organizationId: "session-chat-context-organization",
  serverId: "session-chat-context-server",
  userId: "session-chat-context-user",
}

const compactionConfiguration = {
  auto: true,
  enabled: true,
  maxOverflowRetries: 1,
  maxSummaryTokens: 10,
  pressureThreshold: 0.5,
  recentTokenBudget: 1,
  reserveOutputTokens: 10,
}

function completedText(
  text: string,
  usage?: { completionTokens: number; promptTokens: number; totalTokens: number },
): StreamChunk[] {
  return [
    { runId: "run", threadId: "session", timestamp: 1, type: EventType.RUN_STARTED },
    { delta: text, messageId: "message", timestamp: 2, type: EventType.TEXT_MESSAGE_CONTENT },
    {
      finishReason: "stop",
      outcome: { type: "success" },
      ...(usage === undefined ? {} : { usage }),
      runId: "run",
      threadId: "session",
      timestamp: 3,
      type: EventType.RUN_FINISHED,
    },
  ] as StreamChunk[]
}

async function sessionCreate(sessionId: string, messages: readonly { content: string; role: "assistant" | "user" }[]) {
  await database.insert(sessionTable).values({
    clientRequestId: `${sessionId}-request`,
    id: sessionId,
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: sessionId,
    userId: fixture.userId,
  })
  await database.insert(messageTable).values(
    messages.map((message, index) => ({
      agentId: fixture.agentId,
      clientRequestId: `${sessionId}-message-${index + 1}`,
      content: message.content,
      id: `${sessionId}-message-${index + 1}`,
      role: message.role,
      sequence: index + 1,
      sessionId,
    })),
  )
}

function contextOptions(
  sessionId: string,
  history: Array<CompactionMessage>,
  prompt: string,
  overrides: { auto?: boolean; enabled?: boolean } = {},
  preparedUserMessage?: { id: string; sequence: number },
) {
  return {
    compactionAdapter: ((_input: CliProxyApiAdapterInput) =>
      (async function* () {
        for (const chunk of completedText("summary")) yield chunk
      })()) as CliProxyApiAdapter,
    compactionConfiguration: { ...compactionConfiguration, ...overrides },
    contextLimitTokens: 100,
    database,
    history,
    organizationId: fixture.organizationId,
    prompt,
    ...(preparedUserMessage === undefined ? {} : { preparedUserMessage }),
    sessionId,
    userId: fixture.userId,
  }
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values({ displayName: "Session Chat Context User", id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: "Session Chat Context Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-chat-context.test",
    id: fixture.serverId,
    name: "Session Chat Context Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    configuration: { model: "session-chat-context-model", provider: "deterministic" },
    id: fixture.agentId,
    name: "Session Chat Context Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

test("does not compact below pressure", async () => {
  const sessionId = "session-chat-context-below-pressure"
  await sessionCreate(sessionId, [{ content: "small prompt", role: "user" }])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  let summaryCalls = 0
  const result = await sessionChatContextPrepare({
    ...contextOptions(sessionId, reconstructed.data.history, "small prompt"),
    compactionAdapter: ((input: CliProxyApiAdapterInput) => {
      summaryCalls += input.compaction === true ? 1 : 0
      return (async function* () {})()
    }) as CliProxyApiAdapter,
    contextLimitTokens: 10_000,
  })

  expect(result).toMatchObject({ success: true, data: { advanced: false } })
  expect(summaryCalls).toBe(0)
})

test("compacts when projected pressure crosses the configured threshold", async () => {
  const sessionId = "session-chat-context-pressure"
  await sessionCreate(sessionId, [
    { content: "old context ".repeat(100), role: "user" },
    { content: "old answer ".repeat(100), role: "assistant" },
    { content: "current prompt", role: "user" },
  ])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  let summaryCalls = 0
  const result = await sessionChatContextPrepare({
    ...contextOptions(sessionId, reconstructed.data.history, "current prompt"),
    compactionAdapter: ((input: CliProxyApiAdapterInput) => {
      summaryCalls += input.compaction === true ? 1 : 0
      return (async function* () {
        for (const chunk of completedText("summary")) yield chunk
      })()
    }) as CliProxyApiAdapter,
  })

  expect(result).toMatchObject({ success: true, data: { advanced: true } })
  expect(summaryCalls).toBe(1)
  if (result.success) {
    expect(result.data.history[0]).toMatchObject({ content: "summary", role: "system" })
    expect(result.data.history.filter((message) => message.role === "user")).toHaveLength(1)
  }
})

test("does not auto-compact when automatic compaction is disabled", async () => {
  const sessionId = "session-chat-context-disabled"
  await sessionCreate(sessionId, [
    { content: "old context ".repeat(100), role: "user" },
    { content: "old answer ".repeat(100), role: "assistant" },
    { content: "current prompt", role: "user" },
  ])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  let summaryCalls = 0
  const result = await sessionChatContextPrepare({
    ...contextOptions(sessionId, reconstructed.data.history, "current prompt", { auto: false }),
    compactionAdapter: ((input: CliProxyApiAdapterInput) => {
      summaryCalls += input.compaction === true ? 1 : 0
      return (async function* () {})()
    }) as CliProxyApiAdapter,
  })

  expect(result).toMatchObject({ success: true, data: { advanced: false } })
  expect(summaryCalls).toBe(0)
})

test("deduplicates the prepared user by durable identity rather than content", async () => {
  const sessionId = "session-chat-context-identity-dedupe"
  const prompt = "current prompt"
  await sessionCreate(sessionId, [
    { content: "old context", role: "user" },
    { content: prompt, role: "user" },
  ])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  const history = [...reconstructed.data.history, { content: "later request", id: "later", role: "user" as const }]
  const result = await sessionChatContextPrepare(
    contextOptions(sessionId, history, prompt, {}, { id: `${sessionId}-message-2`, sequence: 2 }),
  )

  expect(result).toMatchObject({ success: true, data: { advanced: true } })
  if (result.success)
    expect(result.data.history.filter((message) => message.id === `${sessionId}-message-2`)).toHaveLength(1)
})

test("does not compact when compaction is disabled", async () => {
  const sessionId = "session-chat-context-compaction-disabled"
  await sessionCreate(sessionId, [
    { content: "old context ".repeat(100), role: "user" },
    { content: "old answer ".repeat(100), role: "assistant" },
    { content: "current prompt", role: "user" },
  ])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  let summaryCalls = 0
  const result = await sessionChatContextPrepare({
    ...contextOptions(sessionId, reconstructed.data.history, "current prompt", { enabled: false }),
    compactionAdapter: ((input: CliProxyApiAdapterInput) => {
      summaryCalls += input.compaction === true ? 1 : 0
      return (async function* () {})()
    }) as CliProxyApiAdapter,
  })

  expect(result).toMatchObject({ success: true, data: { advanced: false } })
  expect(summaryCalls).toBe(0)
})

test("skips automatic compaction when the selected model has no context metadata", async () => {
  const sessionId = "session-chat-context-metadata-missing"
  await sessionCreate(sessionId, [{ content: "large context ".repeat(100), role: "user" }])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  let summaryCalls = 0
  const result = await sessionChatContextPrepare({
    ...contextOptions(sessionId, reconstructed.data.history, "large context ".repeat(100)),
    compactionAdapter: ((input: CliProxyApiAdapterInput) => {
      summaryCalls += input.compaction === true ? 1 : 0
      return (async function* () {})()
    }) as CliProxyApiAdapter,
    contextLimitTokens: undefined,
  })

  expect(result).toMatchObject({ success: true, data: { advanced: false } })
  expect(summaryCalls).toBe(0)
})

test("preserves the original request when no eligible compaction boundary exists", async () => {
  const sessionId = "session-chat-context-ineligible-boundary"
  const prompt = "only prompt ".repeat(100)
  await sessionCreate(sessionId, [{ content: prompt, role: "user" }])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  let summaryCalls = 0
  const result = await sessionChatContextPrepare({
    ...contextOptions(sessionId, reconstructed.data.history, prompt),
    compactionAdapter: ((input: CliProxyApiAdapterInput) => {
      summaryCalls += input.compaction === true ? 1 : 0
      return (async function* () {})()
    }) as CliProxyApiAdapter,
  })

  expect(result).toMatchObject({ success: true, data: { advanced: false, history: reconstructed.data.history } })
  expect(summaryCalls).toBe(0)
})

test("prepares one compacted outer request with the reconstructed history", async () => {
  const sessionId = "session-chat-context-tool-loop"
  await sessionCreate(sessionId, [
    { content: "old context ".repeat(100), role: "user" },
    { content: "old answer ".repeat(100), role: "assistant" },
    { content: "current prompt", role: "user" },
  ])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  let observed: CliProxyApiAdapterInput | undefined
  const history = [
    ...reconstructed.data.history,
    {
      content: "{}",
      role: "assistant" as const,
      toolCalls: [{ id: "tool-call-1", name: "inspect", arguments: {} }],
    },
    { content: "tool output", role: "tool" as const, toolCallId: "tool-call-1" },
  ]
  let summaryCalls = 0
  let providerCalls = 0
  const compactionAwareAdapter = ((input: CliProxyApiAdapterInput) =>
    (async function* () {
      if (input.compaction === true) summaryCalls += 1
      else {
        providerCalls += 1
        observed = input
      }
      yield* completedText(input.compaction === true ? "summary" : "done")
    })()) as CliProxyApiAdapter
  const stream = sessionChatStreamCreate({
    adapter: compactionAwareAdapter as never,
    compactionAdapter: compactionAwareAdapter,
    compactionConfiguration,
    contextLimitTokens: 100,
    database,
    history,
    organizationId: fixture.organizationId,
    prompt: "current prompt",
    providerOutput: {
      append: async () => ({ success: true, data: undefined }),
      flush: async () => ({ success: true, data: undefined }),
    },
    requestId: "tool-loop-request",
    runId: "tool-loop-run",
    sessionId,
    signal: new AbortController().signal,
    userId: fixture.userId,
  })
  for await (const _chunk of stream) {
    // Consume the provider stream so the outer request is executed.
  }

  expect(summaryCalls).toBe(1)
  expect(providerCalls).toBe(1)
  expect(observed?.history).toMatchObject([
    { role: "system", content: "summary" },
    { role: "user", content: "current prompt" },
    { role: "assistant", toolCalls: [{ id: "tool-call-1" }] },
    { role: "tool", toolCallId: "tool-call-1" },
  ])
})

test("skips compaction instead of summarizing an incomplete runtime tool lifecycle", async () => {
  const sessionId = "session-chat-context-incomplete-tool-loop"
  await sessionCreate(sessionId, [
    { content: "old context ".repeat(100), role: "user" },
    { content: "old answer ".repeat(100), role: "assistant" },
    { content: "current prompt", role: "user" },
  ])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  const history = [
    ...reconstructed.data.history,
    {
      content: "{}",
      role: "assistant" as const,
      toolCalls: [{ id: "incomplete-tool-call", name: "inspect", arguments: {} }],
    },
  ]
  let summaryCalls = 0
  const result = await sessionChatContextPrepare({
    ...contextOptions(sessionId, history, "current prompt"),
    compactionAdapter: ((input: CliProxyApiAdapterInput) => {
      summaryCalls += input.compaction === true ? 1 : 0
      return (async function* () {
        yield* completedText("summary")
      })()
    }) as CliProxyApiAdapter,
  })

  expect(result).toMatchObject({ success: true, data: { advanced: false, history } })
  expect(summaryCalls).toBe(0)
})

test("outer requests preserve the original history when summary generation fails", async () => {
  const sessionId = "session-chat-context-summary-failure"
  await sessionCreate(sessionId, [
    { content: "old context ".repeat(100), role: "user" },
    { content: "old answer ".repeat(100), role: "assistant" },
    { content: "current prompt", role: "user" },
  ])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  let providerCalls = 0
  let observed: CliProxyApiAdapterInput | undefined
  const failingSummaryAdapter = ((input: CliProxyApiAdapterInput) =>
    (async function* () {
      if (input.compaction === true) {
        yield {
          code: "provider_failed",
          message: "summary failed",
          timestamp: 1,
          type: EventType.RUN_ERROR,
        }
        return
      }
      providerCalls += 1
      observed = input
      yield* completedText("done")
    })()) as CliProxyApiAdapter
  const stream = sessionChatStreamCreate({
    adapter: failingSummaryAdapter as never,
    compactionAdapter: failingSummaryAdapter,
    compactionConfiguration,
    contextLimitTokens: 100,
    database,
    history: reconstructed.data.history,
    organizationId: fixture.organizationId,
    prompt: "current prompt",
    providerOutput: {
      append: async () => ({ success: true, data: undefined }),
      flush: async () => ({ success: true, data: undefined }),
    },
    requestId: "summary-failure-request",
    runId: "summary-failure-run",
    sessionId,
    signal: new AbortController().signal,
    userId: fixture.userId,
  })
  for await (const _chunk of stream) {
    // Consume the provider stream so the original request completes.
  }

  expect(providerCalls).toBe(1)
  expect(observed?.history).toEqual(reconstructed.data.history)
  expect(
    observed?.history.filter((message) => message.role === "user" && message.content === "current prompt"),
  ).toHaveLength(1)
})

test("persists successful provider usage for the next session context request", async () => {
  const sessionId = "session-chat-context-reported-usage"
  await sessionCreate(sessionId, [{ content: "current prompt", role: "user" }])
  const reconstructed = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(reconstructed.success).toBe(true)
  if (!reconstructed.success) return

  const adapter = ((_input: CliProxyApiAdapterInput) =>
    (async function* () {
      yield* completedText("done", { completionTokens: 20, promptTokens: 1_000, totalTokens: 1_020 })
    })()) as CliProxyApiAdapter
  const stream = sessionChatStreamCreate({
    adapter,
    compactionConfiguration: { ...compactionConfiguration, pressureThreshold: 0.9 },
    contextLimitTokens: 10_000,
    database,
    history: reconstructed.data.history,
    organizationId: fixture.organizationId,
    preparedUserMessage: { id: `${sessionId}-message-1`, sequence: 1 },
    prompt: "current prompt",
    requestId: `${sessionId}-request-2`,
    runId: `${sessionId}-run-2`,
    sessionId,
    signal: new AbortController().signal,
    userId: fixture.userId,
  })
  for await (const _chunk of stream) {
    // Consume the provider stream so the assistant message is persisted.
  }

  const next = await sessionCompactionContextReconstruct(
    database,
    fixture.userId,
    fixture.organizationId,
    sessionId,
  )
  expect(next).toMatchObject({
    success: true,
    data: { history: [{ role: "user" }, { reportedUsage: { inputTokens: 1_000 }, role: "assistant" }] },
  })
})
