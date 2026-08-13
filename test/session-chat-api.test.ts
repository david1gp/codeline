import { afterAll, beforeAll, expect, test } from "bun:test"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate, type AppCreateOptions } from "../src/app/appCreate.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { developmentUserTable } from "../src/identity/db/developmentUserTable.js"
import { developmentUserUpsert } from "../src/identity/db/developmentUserUpsert.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import type { ProviderRuntimeAdapterOptions } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionChatAdapterCreate } from "../src/session/actions/sessionChatAdapterCreate.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { streamReplayServiceCreate } from "../src/stream/actions/streamReplayServiceCreate.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

type ChatAdapter = NonNullable<AppCreateOptions["sessionChatAdapter"]>
type ChatAdapterInput = Parameters<ChatAdapter>[0]

const databaseUrl = Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline"
const client = postgres(databaseUrl)
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `session-chat-agent-${uuidv7()}`,
  otherAgentId: `session-chat-other-agent-${uuidv7()}`,
  providerAgentId: `session-chat-provider-agent-${uuidv7()}`,
  otherServerId: `session-chat-other-server-${uuidv7()}`,
  otherUserKey: `session-chat-other-user-${uuidv7()}`,
  serverId: `session-chat-server-${uuidv7()}`,
  userKey: `session-chat-user-${uuidv7()}`,
}
const configuration = {
  databaseUrl,
  developmentIdentity: { displayName: "Session Chat User", identityKey: fixture.userKey },
  nodeEnv: "development" as const,
}
const app = appCreate({ configuration, database })
let userId: string | undefined
let otherUserId: string | undefined

function chatBody(sessionId: string, runId: string, prompt: string, messages?: Array<Record<string, unknown>>) {
  return {
    context: [],
    forwardedProps: {},
    messages: messages ?? [{ content: prompt, id: `prompt-${runId}`, role: "user" }],
    runId,
    state: {},
    threadId: sessionId,
    tools: [],
  }
}

async function messageRows(sessionId: string) {
  return database
    .select()
    .from(messageTable)
    .where(eq(messageTable.sessionId, sessionId))
    .orderBy(asc(messageTable.sequence), asc(messageTable.id))
}

async function sessionCreateForTest(ownerUserId: string, title: string, serverId: string, agentId: string) {
  const result = await sessionCreate(database, ownerUserId, {
    clientRequestId: `session-chat-session-${uuidv7()}`,
    metadata: {},
    primaryAgentId: agentId,
    serverId,
    title,
  })
  if (!result.success) throw new Error(result.errorMessage)
  return result.data.session.id
}

async function sseEvents(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text()
  if (text.trim() === "") return []

  return text
    .trim()
    .split("\n\n")
    .map((event) => {
      const data = event
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length)
      if (data === undefined) throw new Error("Invalid SSE event")
      return JSON.parse(data) as Record<string, unknown>
    })
}

async function streamReplay(sessionId: string, runId: string) {
  if (userId === undefined) throw new Error("Expected a test user")
  const replay = await streamReplayServiceCreate({
    database,
    inactivityTimeoutMs: 120_000,
    sessionId,
    streamId: `session-chat:${sessionId}:${runId}`,
    userId,
  }).replay()
  if (!replay.success) throw new Error(replay.errorMessage)
  return replay.data
}

function runStartedChunk(input: ChatAdapterInput): StreamChunk {
  return {
    type: EventType.RUN_STARTED,
    threadId: input.sessionId,
    runId: input.runId,
    timestamp: Date.now(),
  }
}

beforeAll(async () => {
  if (!databaseAvailable) return

  const user = await developmentUserUpsert(database, {
    displayName: "Session Chat User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id

  const otherUser = await developmentUserUpsert(database, {
    displayName: "Other Session Chat User",
    identityKey: fixture.otherUserKey,
  })
  if (!otherUser.success) throw new Error(otherUser.errorMessage)
  otherUserId = otherUser.data.id

  await database.insert(serverTable).values([
    {
      endpoint: "http://session-chat-server.test",
      id: fixture.serverId,
      name: "Session Chat Server",
      ownerUserId: userId,
    },
    {
      endpoint: "http://session-chat-other-server.test",
      id: fixture.otherServerId,
      name: "Other Session Chat Server",
      ownerUserId: otherUserId,
    },
  ])
  await database.insert(agentTable).values([
    {
      configuration: { model: "deterministic-test", provider: "deterministic" },
      id: fixture.agentId,
      name: "Session Chat Agent",
      role: "coding",
      serverId: fixture.serverId,
    },
    {
      configuration: { model: "deterministic-test", provider: "deterministic" },
      id: fixture.otherAgentId,
      name: "Other Session Chat Agent",
      role: "coding",
      serverId: fixture.otherServerId,
    },
    {
      configuration: {
        apiKey: "$CLIPROXYAPI_API_KEY",
        baseUrl: "https://provider.test/v1",
        model: "provider-test-model",
        provider: "cliproxyapi",
      },
      id: fixture.providerAgentId,
      name: "Provider Session Chat Agent",
      role: "coding",
      serverId: fixture.serverId,
    },
  ])
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(developmentUserTable).where(eq(developmentUserTable.id, userId))
  if (otherUserId !== undefined)
    await database.delete(developmentUserTable).where(eq(developmentUserTable.id, otherUserId))
  await client.end()
})

test.skipIf(!databaseAvailable)("chat success streams valid events and uses only durable history", async () => {
  if (userId === undefined) return
  const testUserId = userId
  const sessionId = await sessionCreateForTest(userId, "Chat success", fixture.serverId, fixture.agentId)
  const previous = await databaseTransactionRun(database, (transaction) =>
    messageAppend(transaction, testUserId, sessionId, {
      clientRequestId: `session-chat-previous-${uuidv7()}`,
      content: "durable context",
      role: "user",
    }),
  )
  expect(previous.success).toBe(true)

  let observedHistory: Array<{ content: string; role: string }> = []
  let observedRuntimeOptions: ProviderRuntimeAdapterOptions | undefined
  const observingAdapter: ChatAdapter = (input) => {
    observedHistory = input.history.map(({ content, role }) => ({ content, role }))
    return sessionChatAdapterCreate(input)
  }
  const observingApp = appCreate({
    configuration,
    database,
    providerEnvironment: {},
    providerRuntimeAdapterCreate: (options) => {
      observedRuntimeOptions = options
      return observingAdapter
    },
  })
  const runId = `session-chat-success-${uuidv7()}`
  const response = await observingApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify(
      chatBody(sessionId, runId, "hello", [
        { content: "client history must not be trusted", id: "client-history", role: "assistant" },
        { content: " hello ", id: "client-prompt", role: "user" },
      ]),
    ),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(response.status).toBe(200)
  expect(response.headers.get("Content-Type")).toContain("text/event-stream")

  const events = await sseEvents(response)
  expect(events.map((event) => event.type)).toEqual([
    "RUN_STARTED",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "RUN_FINISHED",
  ])
  expect(
    events
      .filter((event) => event.type === "TEXT_MESSAGE_CONTENT")
      .map((event) => event.delta)
      .join(""),
  ).toBe("Deterministic response: hello")
  expect(observedHistory).toEqual([
    { content: "durable context", role: "user" },
    { content: "hello", role: "user" },
  ])
  expect(observedRuntimeOptions).toEqual({
    configuration: { model: "deterministic-test", provider: "deterministic" },
    environment: {},
  })

  expect(await messageRows(sessionId)).toMatchObject([
    { content: "durable context", role: "user", sequence: 1 },
    { content: "hello", role: "user", sequence: 2 },
    { content: "Deterministic response: hello", role: "assistant", sequence: 3 },
  ])
  const replay = await streamReplay(sessionId, runId)
  expect(replay.events.map((event) => event.payload)).toEqual(events)
  expect(replay.checkpoint.lastSequence).toBe(events.length)
})

test.skipIf(!databaseAvailable)("chat selects the configured provider runtime with injected dependencies", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Provider chat", fixture.serverId, fixture.providerAgentId)
  const environment = { CLIPROXYAPI_API_KEY: "injected-secret" }
  let observedOptions: ProviderRuntimeAdapterOptions | undefined
  const providerApp = appCreate({
    configuration,
    database,
    providerEnvironment: environment,
    providerRuntimeAdapterCreate: (options) => {
      observedOptions = options
      return sessionChatAdapterCreate
    },
  })
  const runId = `session-chat-provider-${uuidv7()}`
  const response = await providerApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify(chatBody(sessionId, runId, "provider prompt")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(200)
  expect((await sseEvents(response)).at(-1)?.type).toBe("RUN_FINISHED")
  expect(observedOptions).toEqual({
    configuration: {
      apiKey: "$CLIPROXYAPI_API_KEY",
      baseUrl: "https://provider.test/v1",
      model: "provider-test-model",
      provider: "cliproxyapi",
    },
    environment,
  })
  expect(await messageRows(sessionId)).toMatchObject([
    { content: "provider prompt", role: "user", sequence: 1 },
    { content: "Deterministic response: provider prompt", role: "assistant", sequence: 2 },
  ])
})

test.skipIf(!databaseAvailable)("chat persists the user before generation and assistant after completion", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat ordering", fixture.serverId, fixture.agentId)
  let release: () => void = () => {}
  let startedResolve: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve
  })
  const gatedAdapter: ChatAdapter = (input) =>
    (async function* () {
      startedResolve()
      yield runStartedChunk(input)
      await gate
      const messageId = `assistant-${input.runId}`
      yield { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant", timestamp: Date.now() }
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: "completed", timestamp: Date.now() }
      yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: Date.now() }
      yield {
        type: EventType.RUN_FINISHED,
        threadId: input.sessionId,
        runId: input.runId,
        outcome: { type: "success" },
        timestamp: Date.now(),
      }
    })()
  const gatedApp = appCreate({ configuration, database, sessionChatAdapter: gatedAdapter })
  const response = await gatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify(chatBody(sessionId, `session-chat-order-${uuidv7()}`, "wait")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  await started
  expect(await messageRows(sessionId)).toMatchObject([{ content: "wait", role: "user", sequence: 1 }])

  release()
  await sseEvents(response)
  expect(await messageRows(sessionId)).toMatchObject([
    { content: "wait", role: "user", sequence: 1 },
    { content: "completed", role: "assistant", sequence: 2 },
  ])
})

test.skipIf(!databaseAvailable)(
  "chat replays a successfully checkpointed run without duplicating messages",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(userId, "Chat idempotency", fixture.serverId, fixture.agentId)
    const runId = `session-chat-idempotent-${uuidv7()}`
    const body = chatBody(sessionId, runId, "same request")

    const first = await app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(first.status).toBe(200)
    const firstEvents = await sseEvents(first)

    const repeated = await app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(repeated.status).toBe(200)
    expect(await sseEvents(repeated)).toEqual(firstEvents)
    expect(firstEvents.at(-1)?.type).toBe("RUN_FINISHED")
    expect(await messageRows(sessionId)).toHaveLength(2)

    const conflicting = await app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "different request")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(conflicting.status).toBe(409)
    expect(await messageRows(sessionId)).toHaveLength(2)
  },
)

test.skipIf(!databaseAvailable)("chat executes a new run after its stream status was inspected", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat status probe", fixture.serverId, fixture.agentId)
  const runId = `session-chat-status-probe-${uuidv7()}`
  const streamId = encodeURIComponent(`session-chat:${sessionId}:${runId}`)

  const status = await app.request(`http://codeline.test/api/sessions/${sessionId}/streams/${streamId}/status`)
  expect(status.status).toBe(200)
  expect(await status.json()).toMatchObject({ lastEventId: null, lastSequence: 0 })

  const response = await app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify(chatBody(sessionId, runId, "probe first")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(response.status).toBe(200)
  const events = await sseEvents(response)
  expect(events.at(-1)?.type).toBe("RUN_FINISHED")
  expect(await messageRows(sessionId)).toMatchObject([
    { content: "probe first", role: "user", sequence: 1 },
    { content: "Deterministic response: probe first", role: "assistant", sequence: 2 },
  ])
})

test.skipIf(!databaseAvailable)("chat validates the thread and final plain-text prompt contract", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat validation", fixture.serverId, fixture.agentId)
  const requests = [
    {
      ...chatBody(sessionId, `session-chat-validation-missing-run-${uuidv7()}`, "prompt"),
      runId: undefined,
    },
    { ...chatBody("different-session", `session-chat-validation-thread-${uuidv7()}`, "prompt") },
    {
      ...chatBody(sessionId, `session-chat-validation-role-${uuidv7()}`, "prompt"),
      messages: [{ content: "not a prompt", id: "assistant", role: "assistant" }],
    },
    {
      ...chatBody(sessionId, `session-chat-validation-content-${uuidv7()}`, "prompt"),
      messages: [{ content: [{ text: "not plain text", type: "text" }], id: "multimodal", role: "user" }],
    },
    {
      ...chatBody(sessionId, `session-chat-validation-empty-${uuidv7()}`, "prompt"),
      messages: [{ content: "   ", id: "empty", role: "user" }],
    },
  ]

  for (const body of requests) {
    const response = await app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(response.status).toBe(400)
  }
  expect(await messageRows(sessionId)).toEqual([])
})

test.skipIf(!databaseAvailable)("chat rejects archived, missing, and inaccessible sessions", async () => {
  if (userId === undefined || otherUserId === undefined) return
  const archivedSessionId = await sessionCreateForTest(userId, "Chat archived", fixture.serverId, fixture.agentId)
  const archived = await sessionArchive(database, userId, archivedSessionId)
  expect(archived.success).toBe(true)

  const archivedResponse = await app.request(`http://codeline.test/api/sessions/${archivedSessionId}/chat`, {
    body: JSON.stringify(chatBody(archivedSessionId, `session-chat-archived-${uuidv7()}`, "blocked")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(archivedResponse.status).toBe(409)

  const otherSessionId = await sessionCreateForTest(
    otherUserId,
    "Chat inaccessible",
    fixture.otherServerId,
    fixture.otherAgentId,
  )
  const inaccessibleResponse = await app.request(`http://codeline.test/api/sessions/${otherSessionId}/chat`, {
    body: JSON.stringify(chatBody(otherSessionId, `session-chat-inaccessible-${uuidv7()}`, "hidden")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(inaccessibleResponse.status).toBe(404)

  const missingSessionId = `missing-session-${uuidv7()}`
  const missingResponse = await app.request(`http://codeline.test/api/sessions/${missingSessionId}/chat`, {
    body: JSON.stringify(chatBody(missingSessionId, `session-chat-missing-${uuidv7()}`, "missing")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(missingResponse.status).toBe(404)
})

test.skipIf(!databaseAvailable)("chat checkpoints interrupted execution without finalizing an assistant", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat failure", fixture.serverId, fixture.agentId)
  const failingAdapter: ChatAdapter = (input) =>
    (async function* () {
      yield runStartedChunk(input)
      const messageId = `assistant-${input.runId}`
      yield { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant", timestamp: Date.now() }
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: "partial", timestamp: Date.now() }
    })()
  const failingApp = appCreate({ configuration, database, sessionChatAdapter: failingAdapter })
  const runId = `session-chat-failure-${uuidv7()}`
  const response = await failingApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify(chatBody(sessionId, runId, "fail")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(response.status).toBe(200)
  const events = await sseEvents(response)
  expect(events.at(-1)).toMatchObject({ code: "chat_interrupted", type: "RUN_ERROR" })
  expect(await messageRows(sessionId)).toMatchObject([{ content: "fail", role: "user", sequence: 1 }])
  const replay = await streamReplay(sessionId, runId)
  expect(replay.events.map((event) => event.payload)).toEqual(events)
  expect(replay.checkpoint.lastSequence).toBe(events.length)
})

test.skipIf(!databaseAvailable)("chat does not persist an assistant after adapter abort", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat abort", fixture.serverId, fixture.agentId)
  let startedResolve: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve
  })
  const abortAdapter: ChatAdapter = (input) =>
    (async function* () {
      startedResolve()
      yield runStartedChunk(input)
      await new Promise<void>((resolve) => {
        if (input.signal.aborted) {
          resolve()
          return
        }
        input.signal.addEventListener("abort", () => resolve(), { once: true })
      })
    })()
  const abortApp = appCreate({ configuration, database, sessionChatAdapter: abortAdapter })
  const controller = new AbortController()
  const response = await abortApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify(chatBody(sessionId, `session-chat-abort-${uuidv7()}`, "abort")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: controller.signal,
  })
  const bodyPromise = response.text()
  await started
  controller.abort()
  await bodyPromise
  expect(await messageRows(sessionId)).toMatchObject([{ content: "abort", role: "user", sequence: 1 }])
})
