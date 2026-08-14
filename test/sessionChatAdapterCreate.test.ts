import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { and, asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { type AppCreateOptions, appCreate } from "../src/app/appCreate.js"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { configurationStoreWrite } from "../src/configuration/configurationStoreWrite.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { developmentUserTable } from "../src/identity/db/developmentUserTable.js"
import { developmentUserUpsert } from "../src/identity/db/developmentUserUpsert.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import {
  type ProviderRuntimeAdapterOptions,
  providerRuntimeAdapterCreate,
} from "../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runTable } from "../src/run/db/runTable.js"
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

async function configurationStoreForTest() {
  const configDirectory = mkdtempSync(join(Bun.env.TMPDIR ?? "/tmp", "codeline-chat-lifecycle-"))
  const storeResult = await configurationStoreCreate({
    authorEmail: "session-chat-lifecycle@example.com",
    authorName: "Codeline Session Chat Lifecycle Test",
    branch: "main",
    dir: configDirectory,
  })
  if (!storeResult.success) throw new Error(storeResult.errorMessage)

  const configuration = await configurationStoreWrite(storeResult.data, {
    agentConfigurations: [
      {
        configuration: { model: "lifecycle-test", provider: "deterministic" },
        target: { agentId: fixture.agentId, serverId: fixture.serverId },
      },
    ],
    version: 1,
  })
  if (!configuration.success) throw new Error(configuration.errorMessage)
  return { configDirectory, store: storeResult.data }
}

async function runRowsForTest(sessionId: string, runId: string) {
  const runs = await database
    .select()
    .from(runTable)
    .where(and(eq(runTable.sessionId, sessionId), eq(runTable.clientRunId, runId)))
  const attempts =
    runs[0] === undefined ? [] : await database.select().from(attemptTable).where(eq(attemptTable.runId, runs[0].id))
  return { attempts, runs }
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
        generation: { maxTokens: 512, temperature: 0.2 },
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
      generation: { maxTokens: 512, temperature: 0.2 },
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

test.skipIf(!databaseAvailable)(
  "chat passes a same-provider model override without changing stored settings",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(
      userId,
      "Provider model override",
      fixture.serverId,
      fixture.providerAgentId,
    )
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

    const response = await providerApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify({
        ...chatBody(sessionId, `session-chat-provider-override-${uuidv7()}`, "provider prompt"),
        forwardedProps: { codelineExecution: { model: "selected-model", provider: "cliproxyapi" } },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(200)
    await sseEvents(response)
    expect(observedOptions).toEqual({
      configuration: {
        apiKey: "$CLIPROXYAPI_API_KEY",
        baseUrl: "https://provider.test/v1",
        generation: { maxTokens: 512, temperature: 0.2 },
        model: "selected-model",
        provider: "cliproxyapi",
      },
      environment,
    })
  },
)

test.skipIf(!databaseAvailable)("chat replays a checkpoint instead of resolving a different override", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(
    userId,
    "Provider model replay",
    fixture.serverId,
    fixture.providerAgentId,
  )
  const environment = { CLIPROXYAPI_API_KEY: "injected-secret" }
  let runtimeResolutionCount = 0
  const providerApp = appCreate({
    configuration,
    database,
    providerEnvironment: environment,
    providerRuntimeAdapterCreate: (options) => {
      runtimeResolutionCount += 1
      return providerRuntimeAdapterCreate(options)
    },
  })
  const runId = `session-chat-provider-replay-${uuidv7()}`
  const request = (model: string) =>
    providerApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify({
        ...chatBody(sessionId, runId, "provider replay"),
        forwardedProps: { codelineExecution: { model, provider: "cliproxyapi" } },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

  const first = await request("first-model")
  const firstEvents = await sseEvents(first)
  const repeated = await request("second-model")
  expect(await sseEvents(repeated)).toEqual(firstEvents)
  expect(runtimeResolutionCount).toBe(1)
  expect(firstEvents.find((event) => event.type === "TEXT_MESSAGE_CONTENT")?.delta).toBe("[CLIProxyAPI:first-model] ")
})

test.skipIf(!databaseAvailable)("chat rejects an override that switches provider families", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Provider mismatch", fixture.serverId, fixture.providerAgentId)
  const response = await app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify({
      ...chatBody(sessionId, `session-chat-provider-mismatch-${uuidv7()}`, "provider mismatch"),
      forwardedProps: { codelineExecution: { model: "selected-model", provider: "codex-lb" } },
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(400)
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

test.skipIf(!databaseAvailable)(
  "chat admission persists the committed snapshot and one initial attempt across repeated run IDs",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(userId, "Chat durable admission", fixture.serverId, fixture.agentId)
    const configDirectory = mkdtempSync(join(Bun.env.TMPDIR ?? "/tmp", "codeline-chat-admission-"))

    try {
      const storeResult = await configurationStoreCreate({
        authorEmail: "session-chat-admission@example.com",
        authorName: "Codeline Session Chat Admission Test",
        branch: "main",
        dir: configDirectory,
      })
      expect(storeResult.success).toBe(true)
      if (!storeResult.success) return

      const store = storeResult.data
      const firstConfiguration = {
        agentConfigurations: [
          {
            configuration: { model: "committed-first", provider: "deterministic" },
            target: { agentId: fixture.agentId, serverId: fixture.serverId },
          },
        ],
        version: 1 as const,
      }
      const firstRevision = await configurationStoreWrite(store, firstConfiguration)
      expect(firstRevision.success).toBe(true)
      if (!firstRevision.success) return

      const admissionApp = appCreate({ configuration, configurationStore: store, database })
      const runId = `session-chat-admission-${uuidv7()}`
      const body = chatBody(sessionId, runId, "persist this snapshot")
      const first = await admissionApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      expect(first.status).toBe(200)
      const firstEvents = await sseEvents(first)

      const secondRevision = await configurationStoreWrite(store, {
        ...firstConfiguration,
        agentConfigurations: [
          {
            ...firstConfiguration.agentConfigurations[0]!,
            configuration: { model: "committed-second", provider: "deterministic" },
          },
        ],
      })
      expect(secondRevision.success).toBe(true)

      const repeated = await admissionApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      expect(repeated.status).toBe(200)
      expect(await sseEvents(repeated)).toEqual(firstEvents)

      const runs = await database
        .select()
        .from(runTable)
        .where(and(eq(runTable.sessionId, sessionId), eq(runTable.clientRunId, runId)))
      expect(runs).toHaveLength(1)
      expect(runs[0]).toMatchObject({
        snapshot: {
          configuration: { model: "committed-first", provider: "deterministic" },
          configurationRevision: firstRevision.data,
          target: { agentId: fixture.agentId, serverId: fixture.serverId },
        },
        status: "succeeded",
      })
      const attempts = await database.select().from(attemptTable).where(eq(attemptTable.runId, runs[0]!.id))
      expect(attempts).toHaveLength(1)
      expect(attempts[0]).toMatchObject({
        ordinal: 1,
        snapshot: runs[0]!.snapshot,
        status: "succeeded",
      })
    } finally {
      rmSync(configDirectory, { force: true, recursive: true })
    }
  },
)

test.skipIf(!databaseAvailable)("chat transitions the admitted run and attempt to succeeded", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat lifecycle success", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  try {
    const lifecycleApp = appCreate({ configuration, configurationStore: lifecycle.store, database })
    const runId = `session-chat-lifecycle-success-${uuidv7()}`
    const response = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "succeed")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(200)
    expect((await sseEvents(response)).at(-1)?.type).toBe("RUN_FINISHED")
    const rows = await runRowsForTest(sessionId, runId)
    expect(rows.runs).toHaveLength(1)
    expect(rows.attempts).toHaveLength(1)
    expect(rows.runs[0]).toMatchObject({ failure: null, status: "succeeded" })
    expect(rows.attempts[0]).toMatchObject({ failure: null, ordinal: 1, status: "succeeded" })
    expect(rows.runs[0]?.startedAt).toBeInstanceOf(Date)
    expect(rows.runs[0]?.finishedAt).toBeInstanceOf(Date)
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)("chat transitions a provider failure to failed", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat lifecycle failure", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  const failingAdapter: ChatAdapter = (input) =>
    (async function* () {
      yield runStartedChunk(input)
      yield {
        code: "provider_failed",
        message: "The provider failed.",
        timestamp: Date.now(),
        type: EventType.RUN_ERROR,
      }
    })()

  try {
    const lifecycleApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      sessionChatAdapter: failingAdapter,
    })
    const runId = `session-chat-lifecycle-failure-${uuidv7()}`
    const response = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "fail")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(200)
    expect((await sseEvents(response)).at(-1)).toMatchObject({ code: "provider_failed", type: "RUN_ERROR" })
    const rows = await runRowsForTest(sessionId, runId)
    expect(rows.runs).toHaveLength(1)
    expect(rows.attempts).toHaveLength(1)
    expect(rows.runs[0]).toMatchObject({
      failure: { code: "provider_failed", message: "The provider failed." },
      status: "failed",
    })
    expect(rows.attempts[0]).toMatchObject({
      failure: { code: "provider_failed", message: "The provider failed." },
      ordinal: 1,
      status: "failed",
    })
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)("chat automatically executes an admitted retry after a retryable failure", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat automatic retry", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  let adapterCalls = 0
  const retryAdapter: ChatAdapter = (input) => {
    adapterCalls += 1
    if (adapterCalls !== 1) return sessionChatAdapterCreate(input)
    return (async function* () {
      yield runStartedChunk(input)
      yield {
        code: "provider_failed",
        message: "The provider failed once.",
        timestamp: Date.now(),
        type: EventType.RUN_ERROR,
      }
    })()
  }

  try {
    const lifecycleApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      runCreate: (database, ownerUserId, ownerSessionId, input) =>
        runCreate(database, ownerUserId, ownerSessionId, {
          ...input,
          budget: { maxAttempts: 2 },
        }),
      sessionChatAdapter: retryAdapter,
    })
    const runId = `session-chat-automatic-retry-${uuidv7()}`
    const response = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "retry this")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(200)
    const events = await sseEvents(response)
    expect(events.filter((event) => event.type === "RUN_ERROR")).toHaveLength(1)
    expect(events.at(-1)?.type).toBe("RUN_FINISHED")
    expect(adapterCalls).toBe(2)

    const rows = await runRowsForTest(sessionId, runId)
    expect(rows.runs).toHaveLength(1)
    expect(rows.attempts).toHaveLength(2)
    expect(rows.attempts.map((attempt) => [attempt.ordinal, attempt.status])).toEqual([
      [1, "failed"],
      [2, "succeeded"],
    ])
    expect(rows.runs[0]).toMatchObject({ status: "succeeded", failure: null })
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)("chat stops automatic retries at the persisted attempt budget", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat exhausted retry", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  let adapterCalls = 0
  const failingAdapter: ChatAdapter = (input) => {
    adapterCalls += 1
    return (async function* () {
      yield runStartedChunk(input)
      yield {
        code: "provider_failed",
        message: `The provider failed on attempt ${adapterCalls}.`,
        timestamp: Date.now(),
        type: EventType.RUN_ERROR,
      }
    })()
  }

  try {
    const lifecycleApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      runCreate: (database, ownerUserId, ownerSessionId, input) =>
        runCreate(database, ownerUserId, ownerSessionId, {
          ...input,
          budget: { maxAttempts: 2 },
        }),
      sessionChatAdapter: failingAdapter,
    })
    const runId = `session-chat-exhausted-retry-${uuidv7()}`
    const response = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "exhaust this")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(response.status).toBe(200)
    const events = await sseEvents(response)
    expect(events.filter((event) => event.type === "RUN_ERROR")).toHaveLength(2)
    expect(events.at(-1)).toMatchObject({ code: "provider_failed", type: "RUN_ERROR" })
    expect(adapterCalls).toBe(2)

    const rows = await runRowsForTest(sessionId, runId)
    expect(rows.runs[0]).toMatchObject({ status: "failed" })
    expect(rows.attempts).toHaveLength(2)
    expect(rows.attempts.every((attempt) => attempt.status === "failed")).toBe(true)
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)("chat replays a completed automatic retry without re-execution", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat automatic retry replay", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  let adapterCalls = 0
  const retryAdapter: ChatAdapter = (input) => {
    adapterCalls += 1
    if (adapterCalls !== 1) return sessionChatAdapterCreate(input)
    return (async function* () {
      yield runStartedChunk(input)
      yield {
        code: "provider_failed",
        message: "The provider failed before replay.",
        timestamp: Date.now(),
        type: EventType.RUN_ERROR,
      }
    })()
  }

  try {
    const lifecycleApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      runCreate: (database, ownerUserId, ownerSessionId, input) =>
        runCreate(database, ownerUserId, ownerSessionId, {
          ...input,
          budget: { maxAttempts: 2 },
        }),
      sessionChatAdapter: retryAdapter,
    })
    const runId = `session-chat-automatic-retry-replay-${uuidv7()}`
    const body = chatBody(sessionId, runId, "replay retry")
    const first = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const firstEvents = await sseEvents(first)

    const repeated = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(repeated.status).toBe(200)
    expect(await sseEvents(repeated)).toEqual(firstEvents)
    expect(adapterCalls).toBe(2)
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)("chat finalizes one assistant message across automatic retries", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat retry cardinality", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  let adapterCalls = 0
  const retryAdapter: ChatAdapter = (input) => {
    adapterCalls += 1
    if (adapterCalls !== 1) return sessionChatAdapterCreate(input)
    return (async function* () {
      yield runStartedChunk(input)
      yield {
        code: "provider_failed",
        message: "The provider failed before finalization.",
        timestamp: Date.now(),
        type: EventType.RUN_ERROR,
      }
    })()
  }

  try {
    const lifecycleApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      runCreate: (database, ownerUserId, ownerSessionId, input) =>
        runCreate(database, ownerUserId, ownerSessionId, {
          ...input,
          budget: { maxAttempts: 2 },
        }),
      sessionChatAdapter: retryAdapter,
    })
    const runId = `session-chat-retry-cardinality-${uuidv7()}`
    const response = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "one assistant")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    await sseEvents(response)

    const messages = await messageRows(sessionId)
    expect(messages).toHaveLength(2)
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1)
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1)
    expect(messages.at(-1)).toMatchObject({ content: "Deterministic response: one assistant", role: "assistant" })
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)("chat transitions an aborted stream to aborted", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat lifecycle abort", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
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

  try {
    const lifecycleApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      sessionChatAdapter: abortAdapter,
    })
    const runId = `session-chat-lifecycle-abort-${uuidv7()}`
    const controller = new AbortController()
    const response = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "abort")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    })
    const bodyPromise = response.text()
    await started
    controller.abort()
    await bodyPromise

    const rows = await runRowsForTest(sessionId, runId)
    expect(rows.runs).toHaveLength(1)
    expect(rows.attempts).toHaveLength(1)
    expect(rows.runs[0]).toMatchObject({ failure: null, status: "aborted" })
    expect(rows.attempts[0]).toMatchObject({ failure: null, ordinal: 1, status: "aborted" })
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)(
  "chat replays a completed lifecycle run without a second provider execution",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(userId, "Chat lifecycle replay", fixture.serverId, fixture.agentId)
    const lifecycle = await configurationStoreForTest()
    let adapterCalls = 0
    const observingAdapter: ChatAdapter = (input) => {
      adapterCalls += 1
      return sessionChatAdapterCreate(input)
    }

    try {
      const lifecycleApp = appCreate({
        configuration,
        configurationStore: lifecycle.store,
        database,
        sessionChatAdapter: observingAdapter,
      })
      const runId = `session-chat-lifecycle-replay-${uuidv7()}`
      const body = chatBody(sessionId, runId, "replay")
      const first = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const firstEvents = await sseEvents(first)

      const repeated = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      expect(await sseEvents(repeated)).toEqual(firstEvents)
      expect(adapterCalls).toBe(1)

      const rows = await runRowsForTest(sessionId, runId)
      expect(rows.runs).toHaveLength(1)
      expect(rows.attempts).toHaveLength(1)
      expect(rows.runs[0]).toMatchObject({ status: "succeeded" })
      expect(rows.attempts[0]).toMatchObject({ ordinal: 1, status: "succeeded" })
    } finally {
      rmSync(lifecycle.configDirectory, { force: true, recursive: true })
    }
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
