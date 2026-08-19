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
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import {
  type ProviderRuntimeAdapterOptions,
  providerRuntimeAdapterCreate,
} from "../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { runCancellationCoordinatorCreate } from "../src/run/actions/runCancellationCoordinatorCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionChatAdapterCreate } from "../src/session/actions/sessionChatAdapterCreate.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { streamReplayServiceCreate } from "../src/stream/actions/streamReplayServiceCreate.js"
import { streamEventTable } from "../src/stream/db/streamEventTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

type ChatAdapter = NonNullable<AppCreateOptions["sessionChatAdapter"]>
type ChatAdapterInput = Parameters<ChatAdapter>[0]

const databaseUrl = Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline"
const client = postgres(databaseUrl)
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `session-chat-agent-${uuidv7()}`,
  lunaAgentId: `luna-high-${uuidv7()}`,
  otherAgentId: `session-chat-other-agent-${uuidv7()}`,
  providerAgentId: `session-chat-provider-agent-${uuidv7()}`,
  otherServerId: `session-chat-other-server-${uuidv7()}`,
  otherUserKey: `session-chat-other-user-${uuidv7()}`,
  serverId: `session-chat-server-${uuidv7()}`,
  userKey: `session-chat-user-${uuidv7()}`,
}
const configuration = {
  authMode: "development" as const,
  databaseUrl,
  developmentIdentity: { displayName: "Session Chat User", identityKey: fixture.userKey },
  nodeEnv: "development" as const,
  oidcOrganizationId: `development:${fixture.userKey}`,
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
  const result = await sessionCreate(
    database,
    ownerUserId,
    {
      clientRequestId: `session-chat-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      serverId,
      title,
    },
    { organizationId: ownerUserId },
  )
  if (!result.success) throw new Error(result.errorMessage)
  return result.data.session.id
}

async function configurationStoreForTest(model = "lifecycle-test") {
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
        configuration: { model, provider: "deterministic" },
        target: { agentId: fixture.agentId, serverId: fixture.serverId },
      },
    ],
    version: 1,
  })
  if (!configuration.success) throw new Error(configuration.errorMessage)
  return { configDirectory, store: storeResult.data }
}

async function providerConfigurationStoreForTest(provider: "cliproxyapi" | "codex-lb") {
  const configDirectory = mkdtempSync(join(Bun.env.TMPDIR ?? "/tmp", "codeline-provider-chat-"))
  const storeResult = await configurationStoreCreate({
    authorEmail: "provider-chat@example.com",
    authorName: "Codeline Provider Chat Test",
    branch: "main",
    dir: configDirectory,
  })
  if (!storeResult.success) throw new Error(storeResult.errorMessage)

  const configuration = await configurationStoreWrite(storeResult.data, {
    agentConfigurations: [
      {
        configuration: {
          apiKey: provider === "cliproxyapi" ? "$CLIPROXYAPI_API_KEY" : "$CODEX_LB_API_TOKEN",
          baseUrl: "https://provider.test/v1",
          generation: { maxTokens: 777, temperature: 0.25 },
          model: "provider-chat-model",
          provider,
        },
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
    runs[0] === undefined
      ? []
      : await database
          .select()
          .from(attemptTable)
          .where(eq(attemptTable.runId, runs[0].id))
          .orderBy(asc(attemptTable.ordinal))
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

async function delegationRows(sessionId: string, runId: string) {
  const rootRows = await runRowsForTest(sessionId, runId)
  const root = rootRows.runs[0]
  if (root === undefined) return { delegations: [], rootRows, childRows: [] }
  const delegations = await database.select().from(runDelegationTable).where(eq(runDelegationTable.rootRunId, root.id))
  const childRows = await Promise.all(
    delegations.map(async (delegation) => {
      const runs = await database.select().from(runTable).where(eq(runTable.id, delegation.childRunId))
      const attempts =
        runs[0] === undefined
          ? []
          : await database
              .select()
              .from(attemptTable)
              .where(eq(attemptTable.runId, runs[0].id))
              .orderBy(asc(attemptTable.ordinal))
      return { attempts, delegation, runs }
    }),
  )
  return { childRows, delegations, rootRows }
}

async function privateStreamEvents(streamId: string, sessionId: string) {
  if (userId === undefined) throw new Error("Expected a test user")
  return database
    .select()
    .from(streamEventTable)
    .where(and(eq(streamEventTable.sessionId, sessionId), eq(streamEventTable.streamId, streamId)))
    .orderBy(asc(streamEventTable.sequence))
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

  const user = await developmentIdentityUpsert(database, {
    displayName: "Session Chat User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id

  const otherUser = await developmentIdentityUpsert(database, {
    displayName: "Other Session Chat User",
    identityKey: fixture.otherUserKey,
  })
  if (!otherUser.success) throw new Error(otherUser.errorMessage)
  otherUserId = otherUser.data.id
  await database.insert(organizationTable).values([
    { id: userId, externalId: userId, name: "Session Chat Organization" },
    { id: otherUserId, externalId: otherUserId, name: "Other Session Chat Organization" },
  ])
  await database.insert(organizationMemberTable).values([
    {
      issuer: "urn:codeline:development",
      organizationId: userId,
      subject: fixture.userKey,
      userId,
    },
    {
      issuer: "urn:codeline:development",
      organizationId: otherUserId,
      subject: fixture.otherUserKey,
      userId: otherUserId,
    },
  ])

  await database.insert(serverTable).values([
    {
      endpoint: "http://session-chat-server.test",
      id: fixture.serverId,
      name: "Session Chat Server",
      organizationId: userId,
    },
    {
      endpoint: "http://session-chat-other-server.test",
      id: fixture.otherServerId,
      name: "Other Session Chat Server",
      organizationId: otherUserId,
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
      configuration: { model: "luna-test", provider: "deterministic" },
      id: fixture.lunaAgentId,
      name: "Luna Session Chat Agent",
      role: "coding",
      serverId: fixture.serverId,
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
  if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  if (otherUserId !== undefined)
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, otherUserId))
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

test.skipIf(!databaseAvailable)("chat intercepts a Luna ping and persists finalized pong", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Luna ping", fixture.serverId, fixture.lunaAgentId)
  const runId = `session-chat-luna-ping-${uuidv7()}`
  const response = await app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify(chatBody(sessionId, runId, "ping")),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(200)
  expect((await sseEvents(response)).at(-1)).toMatchObject({ outcome: { type: "success" }, type: "RUN_FINISHED" })

  const messages = await messageRows(sessionId)
  expect(messages).toHaveLength(2)
  expect(messages[0]).toMatchObject({ content: "ping", finalizedAt: expect.any(Date), role: "user", sequence: 1 })
  expect(messages[1]).toMatchObject({ content: "pong", finalizedAt: expect.any(Date), role: "assistant", sequence: 2 })
  expect(messages[1]?.content).toBe("pong")
})

test.skipIf(!databaseAvailable)("chat completes and replays after the SSE reader disconnects", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat disconnect", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()

  try {
    const lifecycleApp = appCreate({ configuration, configurationStore: lifecycle.store, database })
    const runId = `session-chat-disconnect-${uuidv7()}`
    const response = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "disconnect")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(response.status).toBe(200)
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error("Expected an SSE response body")
    expect((await reader.read()).done).toBe(false)
    await reader.cancel()

    let completed = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const rows = await runRowsForTest(sessionId, runId)
      if (rows.runs[0]?.status === "succeeded") {
        completed = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(completed).toBe(true)
    expect(await messageRows(sessionId)).toMatchObject([
      { content: "disconnect", role: "user" },
      { content: "Deterministic response: disconnect", role: "assistant" },
    ])

    const replayResponse = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "disconnect")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(await sseEvents(replayResponse)).toEqual(
      (await streamReplay(sessionId, runId)).events.map((event) => event.payload as Record<string, unknown>),
    )
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
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

test.skipIf(!databaseAvailable)("chat continues execution after the request disconnects", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat lifecycle abort", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  let startedResolve: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve
  })
  const abortAdapter: ChatAdapter = (input) => {
    startedResolve()
    return sessionChatAdapterCreate(input)
  }

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
    expect(rows.runs[0]).toMatchObject({ failure: null, status: "succeeded" })
    expect(rows.attempts[0]).toMatchObject({ failure: null, ordinal: 1, status: "succeeded" })
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

test.skipIf(!databaseAvailable)(
  "authenticated cancellation signals active chat and cleans up its controller",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(userId, "Chat cancellation command", fixture.serverId, fixture.agentId)
    const lifecycle = await configurationStoreForTest()
    const coordinator = runCancellationCoordinatorCreate()
    let startedResolve: () => void = () => {}
    let adapterAborted = false
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve
    })
    const abortAdapter: ChatAdapter = (input) =>
      (async function* () {
        startedResolve()
        yield runStartedChunk(input)
        await new Promise<void>((resolve) => {
          if (input.signal.aborted) {
            adapterAborted = true
            resolve()
            return
          }
          input.signal.addEventListener(
            "abort",
            () => {
              adapterAborted = true
              resolve()
            },
            { once: true },
          )
        })
      })()

    try {
      const lifecycleApp = appCreate({
        configuration,
        configurationStore: lifecycle.store,
        database,
        runCancellationCoordinator: coordinator,
        sessionChatAdapter: abortAdapter,
      })
      const runId = `session-chat-cancellation-command-${uuidv7()}`
      const response = await lifecycleApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(chatBody(sessionId, runId, "cancel")),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const bodyPromise = response.text()
      await started

      const admitted = await runRowsForTest(sessionId, runId)
      const durableRun = admitted.runs[0]
      if (durableRun === undefined) throw new Error("Expected an admitted durable run")
      const cancelled = await lifecycleApp.request(
        `http://codeline.test/api/sessions/${sessionId}/runs/${runId}/cancel`,
        { method: "POST" },
      )
      expect(cancelled.status).toBe(200)
      expect(await cancelled.json()).toMatchObject({
        cancelledRunIds: [durableRun.id],
        signalledRunIds: [durableRun.id],
      })
      expect(adapterAborted).toBe(true)

      await bodyPromise
      const completed = await runRowsForTest(sessionId, runId)
      expect(completed.runs[0]).toMatchObject({ status: "aborted" })

      const repeated = await lifecycleApp.request(
        `http://codeline.test/api/sessions/${sessionId}/runs/${runId}/cancel`,
        { method: "POST" },
      )
      expect(repeated.status).toBe(200)
      expect(await repeated.json()).toMatchObject({ cancelledRunIds: [], signalledRunIds: [] })

      if (otherUserId === undefined) throw new Error("Expected the second test user")
      const otherConfiguration = {
        ...configuration,
        developmentIdentity: { ...configuration.developmentIdentity, identityKey: fixture.otherUserKey },
        oidcOrganizationId: otherUserId,
      }
      const ownership = await appCreate({ configuration: otherConfiguration, database }).request(
        `http://codeline.test/api/sessions/${sessionId}/runs/${runId}/cancel`,
        { method: "POST" },
      )
      expect(ownership.status).toBe(404)

      const inactive = await runCreate(database, userId, sessionId, {
        clientRunId: `session-chat-inactive-cancellation-${uuidv7()}`,
        snapshot: {
          configuration: { model: "inactive", provider: "deterministic" },
          configurationRevision: "inactive-revision",
          target: { agentId: fixture.agentId, serverId: fixture.serverId },
        },
        streamId: `session-chat-inactive-cancellation-${uuidv7()}`,
      })
      if (!inactive.success) throw new Error(inactive.errorMessage)
      expect(
        await runTransition(database, userId, sessionId, inactive.data.run.id, { status: "running" }),
      ).toMatchObject({
        success: true,
      })
      expect(
        await runTransition(database, userId, sessionId, inactive.data.run.id, { status: "succeeded" }),
      ).toMatchObject({ success: true })
      const inactiveController = new AbortController()
      const unregisterInactive = coordinator.register({
        controller: inactiveController,
        runId: inactive.data.run.id,
        sessionId,
        userId,
      })
      const inactiveCancellation = await lifecycleApp.request(
        `http://codeline.test/api/sessions/${sessionId}/runs/${inactive.data.run.clientRunId}/cancel`,
        { method: "POST" },
      )
      expect(inactiveCancellation.status).toBe(200)
      expect(await inactiveCancellation.json()).toMatchObject({ cancelledRunIds: [], signalledRunIds: [] })
      expect(inactiveController.signal.aborted).toBe(false)
      unregisterInactive()
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

test.skipIf(!databaseAvailable)("chat persists the assistant after a disconnected adapter request", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Chat abort", fixture.serverId, fixture.agentId)
  let startedResolve: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve
  })
  const abortAdapter: ChatAdapter = (input) => {
    startedResolve()
    return sessionChatAdapterCreate(input)
  }
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
  expect(await messageRows(sessionId)).toMatchObject([
    { content: "abort", role: "user", sequence: 1 },
    { content: "Deterministic response: abort", role: "assistant", sequence: 2 },
  ])
})

test.skipIf(!databaseAvailable)(
  "chat awaits one deterministic delegation before completing the root turn",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(userId, "Delegation success", fixture.serverId, fixture.agentId)
    const lifecycle = await configurationStoreForTest()

    try {
      const delegatedApp = appCreate({ configuration, configurationStore: lifecycle.store, database })
      const runId = `session-chat-delegation-success-${uuidv7()}`
      const response = await delegatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(chatBody(sessionId, runId, "delegate:inspect private child")),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const events = await sseEvents(response)
      const rows = await delegationRows(sessionId, runId)

      expect(response.status).toBe(200)
      expect(events.some((event) => event.type === "TOOL_CALL_START")).toBe(true)
      expect(events.some((event) => event.type === "TOOL_CALL_RESULT")).toBe(true)
      expect(rows.delegations).toHaveLength(1)
      expect(rows.delegations[0]?.delegationKey).toBe(
        events.find((event) => event.type === "TOOL_CALL_START")?.toolCallId as string | undefined,
      )
      expect(rows.childRows[0]?.runs[0]).toMatchObject({ status: "succeeded" })
      expect(rows.childRows[0]?.attempts[0]).toMatchObject({ status: "succeeded" })
      expect(rows.rootRows.runs[0]).toMatchObject({ status: "succeeded" })
    } finally {
      rmSync(lifecycle.configDirectory, { force: true, recursive: true })
    }
  },
)

test.skipIf(!databaseAvailable)("chat retries a delegated child without duplicating the root messages", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Delegation retry", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  let childCalls = 0
  const retryRuntimeAdapter: NonNullable<AppCreateOptions["providerRuntimeAdapterCreate"]> = (options) => {
    const base = providerRuntimeAdapterCreate(options)
    return (input) => {
      if (input.prompt === "retry child") {
        childCalls += 1
        if (childCalls === 1) {
          return (async function* () {
            yield runStartedChunk(input)
            yield {
              code: "provider_failed",
              message: "The child provider failed once.",
              timestamp: Date.now(),
              type: EventType.RUN_ERROR,
            }
          })()
        }
      }
      return base(input)
    }
  }

  try {
    const delegatedApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      providerRuntimeAdapterCreate: retryRuntimeAdapter,
      runCreate: (ownerDatabase, ownerUserId, ownerSessionId, input) =>
        runCreate(ownerDatabase, ownerUserId, ownerSessionId, {
          ...input,
          budget: { ...input.budget, maxAttempts: 2 },
        }),
    })
    const runId = `session-chat-delegation-retry-${uuidv7()}`
    const response = await delegatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "delegate:retry child")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    await sseEvents(response)
    const rows = await delegationRows(sessionId, runId)

    expect(childCalls).toBe(2)
    expect(rows.childRows[0]?.attempts.map((attempt) => [attempt.ordinal, attempt.status])).toEqual([
      [1, "failed"],
      [2, "succeeded"],
    ])
    expect(await messageRows(sessionId)).toHaveLength(2)
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)(
  "chat rejects a second delegated child at the server-owned budget boundary",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(userId, "Delegation budget", fixture.serverId, fixture.agentId)
    const lifecycle = await configurationStoreForTest()

    try {
      const delegatedApp = appCreate({ configuration, configurationStore: lifecycle.store, database })
      const runId = `session-chat-delegation-budget-${uuidv7()}`
      const response = await delegatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(chatBody(sessionId, runId, "delegate-twice:first child|second child")),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const events = await sseEvents(response)
      const rows = await delegationRows(sessionId, runId)

      expect(rows.rootRows.runs[0]?.budget).toMatchObject({ maxChildDepth: 1, maxChildRuns: 1 })
      expect(rows.delegations).toHaveLength(1)
      expect(events.filter((event) => event.type === "TOOL_CALL_RESULT")).toHaveLength(2)
      expect(events.some((event) => event.type === "TOOL_CALL_RESULT" && event.state === "output-error")).toBe(true)
      expect(rows.rootRows.runs[0]).toMatchObject({ status: "succeeded" })
    } finally {
      rmSync(lifecycle.configDirectory, { force: true, recursive: true })
    }
  },
)

test.skipIf(!databaseAvailable)("chat propagates explicit Stop to the active delegated child", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Delegation stop", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  const coordinator = runCancellationCoordinatorCreate()
  let childStartedResolve: () => void = () => undefined
  const childStarted = new Promise<void>((resolve) => {
    childStartedResolve = resolve
  })
  const stoppingRuntimeAdapter: NonNullable<AppCreateOptions["providerRuntimeAdapterCreate"]> = (options) => {
    const base = providerRuntimeAdapterCreate(options)
    return (input) => {
      if (input.prompt !== "stop child") return base(input)
      return (async function* () {
        childStartedResolve()
        yield runStartedChunk(input)
        await new Promise<void>((resolve) => {
          if (input.signal.aborted) resolve()
          else input.signal.addEventListener("abort", () => resolve(), { once: true })
        })
      })()
    }
  }

  try {
    const delegatedApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      providerRuntimeAdapterCreate: stoppingRuntimeAdapter,
      runCancellationCoordinator: coordinator,
    })
    const runId = `session-chat-delegation-stop-${uuidv7()}`
    const response = await delegatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "delegate:stop child")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const bodyPromise = response.text()
    await childStarted

    const cancelled = await delegatedApp.request(
      `http://codeline.test/api/sessions/${sessionId}/runs/${runId}/cancel`,
      { method: "POST" },
    )
    expect(cancelled.status).toBe(200)
    const cancellation = await cancelled.json()
    expect(cancellation.cancelledRunIds).toHaveLength(2)

    await bodyPromise
    const rows = await delegationRows(sessionId, runId)
    expect(rows.rootRows.runs[0]).toMatchObject({ status: "aborted" })
    expect(rows.childRows[0]?.runs[0]).toMatchObject({ status: "aborted" })
    expect(await messageRows(sessionId)).toMatchObject([{ content: "delegate:stop child", role: "user" }])
    expect(await messageRows(sessionId)).toHaveLength(1)
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)("chat continues a delegated run after the SSE reader is dropped", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Delegation disconnect", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()

  try {
    const delegatedApp = appCreate({ configuration, configurationStore: lifecycle.store, database })
    const runId = `session-chat-delegation-disconnect-${uuidv7()}`
    const response = await delegatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(chatBody(sessionId, runId, "delegate:continue child")),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error("Expected an SSE response body")
    expect((await reader.read()).done).toBe(false)
    await reader.cancel()

    let completed = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const rows = await delegationRows(sessionId, runId)
      if (rows.rootRows.runs[0]?.status === "succeeded") {
        completed = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(completed).toBe(true)
    expect(await messageRows(sessionId)).toHaveLength(2)
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)("chat replays a completed delegation without executing its child again", async () => {
  if (userId === undefined) return
  const sessionId = await sessionCreateForTest(userId, "Delegation replay", fixture.serverId, fixture.agentId)
  const lifecycle = await configurationStoreForTest()
  let childCalls = 0
  const observingRuntimeAdapter: NonNullable<AppCreateOptions["providerRuntimeAdapterCreate"]> = (options) => {
    const base = providerRuntimeAdapterCreate(options)
    return (input) => {
      if (input.prompt === "replay child") childCalls += 1
      return base(input)
    }
  }

  try {
    const delegatedApp = appCreate({
      configuration,
      configurationStore: lifecycle.store,
      database,
      providerRuntimeAdapterCreate: observingRuntimeAdapter,
    })
    const runId = `session-chat-delegation-replay-${uuidv7()}`
    const body = chatBody(sessionId, runId, "delegate:replay child")
    const first = await delegatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const firstEvents = await sseEvents(first)
    const repeated = await delegatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    expect(await sseEvents(repeated)).toEqual(firstEvents)
    expect(childCalls).toBe(1)
    expect(await messageRows(sessionId)).toHaveLength(2)
  } finally {
    rmSync(lifecycle.configDirectory, { force: true, recursive: true })
  }
})

test.skipIf(!databaseAvailable)(
  "chat keeps delegated child events private and the visible transcript bounded",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(userId, "Delegation privacy", fixture.serverId, fixture.agentId)
    const lifecycle = await configurationStoreForTest()

    try {
      const delegatedApp = appCreate({ configuration, configurationStore: lifecycle.store, database })
      const runId = `session-chat-delegation-privacy-${uuidv7()}`
      const response = await delegatedApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(chatBody(sessionId, runId, "delegate:private child text")),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const visibleEvents = await sseEvents(response)
      const rows = await delegationRows(sessionId, runId)
      const childAttempt = rows.childRows[0]?.attempts[0]
      if (childAttempt === undefined) throw new Error("Expected a child attempt")
      const childEvents = await privateStreamEvents(childAttempt.streamId, sessionId)

      expect(childEvents.some((event) => event.eventType === "text_delta")).toBe(true)
      expect(visibleEvents.filter((event) => event.type === "TEXT_MESSAGE_CONTENT")).toHaveLength(2)
      expect(await messageRows(sessionId)).toMatchObject([
        { content: "delegate:private child text", role: "user" },
        { role: "assistant" },
      ])
      expect(await messageRows(sessionId)).toHaveLength(2)
    } finally {
      rmSync(lifecycle.configDirectory, { force: true, recursive: true })
    }
  },
)

test.skipIf(!databaseAvailable)(
  "simulation scenarios use the real chat API for durable messages, stream events, and attempt transitions",
  async () => {
    if (userId === undefined) return

    const scenarios = [
      {
        assistant: "The deterministic workspace check is streaming. No provider connection is required.",
        attemptStatuses: ["succeeded"],
        eventTypes: [
          "RUN_STARTED",
          "TEXT_MESSAGE_START",
          "TEXT_MESSAGE_CONTENT",
          "TEXT_MESSAGE_CONTENT",
          "TEXT_MESSAGE_END",
          "RUN_FINISHED",
        ],
        model: "simulation-streaming",
        runStatus: "succeeded",
      },
      {
        assistant: "Discovery stayed synthetic and provider-free.",
        attemptStatuses: ["succeeded"],
        eventTypes: [
          "RUN_STARTED",
          "REASONING_START",
          "TOOL_CALL_START",
          "TOOL_CALL_END",
          "TOOL_CALL_RESULT",
          "TOOL_CALL_START",
          "TOOL_CALL_END",
          "TOOL_CALL_RESULT",
          "REASONING_END",
          "TEXT_MESSAGE_START",
          "TEXT_MESSAGE_CONTENT",
          "TEXT_MESSAGE_END",
          "RUN_FINISHED",
        ],
        model: "simulation-thinking-tools",
        runStatus: "succeeded",
      },
      {
        assistant: "The retry completed successfully.",
        attemptStatuses: ["failed", "succeeded"],
        eventTypes: [
          "RUN_STARTED",
          "TEXT_MESSAGE_START",
          "TEXT_MESSAGE_CONTENT",
          "RUN_ERROR",
          "RUN_STARTED",
          "TEXT_MESSAGE_START",
          "TEXT_MESSAGE_CONTENT",
          "TEXT_MESSAGE_END",
          "RUN_FINISHED",
        ],
        model: "simulation-retry-success",
        runStatus: "succeeded",
      },
      {
        assistant: undefined,
        attemptStatuses: ["failed", "failed"],
        eventTypes: [
          "RUN_STARTED",
          "TEXT_MESSAGE_START",
          "TEXT_MESSAGE_CONTENT",
          "RUN_ERROR",
          "RUN_STARTED",
          "TEXT_MESSAGE_START",
          "TEXT_MESSAGE_CONTENT",
          "RUN_ERROR",
        ],
        model: "simulation-retry-exhausted",
        runStatus: "failed",
      },
      {
        assistant: undefined,
        attemptStatuses: ["failed"],
        eventTypes: ["RUN_STARTED", "RUN_ERROR"],
        model: "simulation-terminal-error",
        runStatus: "failed",
      },
    ] as const

    for (const scenario of scenarios) {
      const sessionId = await sessionCreateForTest(
        userId,
        `Simulation ${scenario.model}`,
        fixture.serverId,
        fixture.agentId,
      )
      const lifecycle = await configurationStoreForTest(scenario.model)

      try {
        const runId = `session-chat-simulation-${scenario.model}-${uuidv7()}`
        const scenarioApp = appCreate({ configuration, configurationStore: lifecycle.store, database })
        const response = await scenarioApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
          body: JSON.stringify(chatBody(sessionId, runId, "run this deterministic scenario")),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
        const events = await sseEvents(response)
        const rows = await runRowsForTest(sessionId, runId)
        const messages = await messageRows(sessionId)
        const persistedEvents = (
          await Promise.all(rows.attempts.map((attempt) => privateStreamEvents(attempt.streamId, sessionId)))
        ).flat()

        expect(response.status).toBe(200)
        expect(events.map((event) => event.type)).toEqual([...scenario.eventTypes])
        expect(persistedEvents.map((event) => event.eventType)).toEqual([...scenario.eventTypes])
        expect(persistedEvents.map((event) => event.payload)).toEqual(events)
        expect(messages.map(({ content, role }) => ({ content, role }))).toEqual([
          { content: "run this deterministic scenario", role: "user" },
          ...(scenario.assistant === undefined ? [] : [{ content: scenario.assistant, role: "assistant" }]),
        ])
        expect(rows.runs[0]).toMatchObject({ status: scenario.runStatus })
        expect(rows.attempts.map((attempt) => attempt.status)).toEqual([...scenario.attemptStatuses])
        if (scenario.model === "simulation-retry-success") {
          expect(events.filter((event) => event.type === "RUN_ERROR")).toHaveLength(1)
          expect(rows.attempts[0]?.failure).toMatchObject({ code: "provider_timeout" })
        }
        if (scenario.model === "simulation-retry-exhausted") {
          expect(events.filter((event) => event.type === "RUN_ERROR")).toHaveLength(2)
          expect(rows.attempts[1]?.failure).toMatchObject({ code: "provider_unavailable" })
        }
        if (scenario.model === "simulation-terminal-error") {
          expect(events.at(-1)).toMatchObject({ code: "assistant_empty", type: "RUN_ERROR" })
          expect(rows.runs[0]?.failure).toMatchObject({ code: "assistant_empty" })
        }
      } finally {
        rmSync(lifecycle.configDirectory, { force: true, recursive: true })
      }
    }
  },
)

test.skipIf(!databaseAvailable)(
  "simulation cancellation aborts the real API run and records its terminal stream event",
  async () => {
    if (userId === undefined) return
    const sessionId = await sessionCreateForTest(userId, "Simulation cancellation", fixture.serverId, fixture.agentId)
    const lifecycle = await configurationStoreForTest("simulation-cancellation")

    try {
      const runId = `session-chat-simulation-cancellation-${uuidv7()}`
      const scenarioApp = appCreate({ configuration, configurationStore: lifecycle.store, database })
      const response = await scenarioApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify(chatBody(sessionId, runId, "cancel this deterministic scenario")),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const bodyPromise = response.text()
      let running = false
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const rows = await runRowsForTest(sessionId, runId)
        if (rows.runs[0]?.status === "running") {
          running = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      expect(running).toBe(true)

      const cancelled = await scenarioApp.request(
        `http://codeline.test/api/sessions/${sessionId}/runs/${runId}/cancel`,
        {
          method: "POST",
        },
      )
      expect(cancelled.status).toBe(200)
      expect((await cancelled.json()).signalledRunIds).toHaveLength(1)
      await bodyPromise

      const rows = await runRowsForTest(sessionId, runId)
      const events =
        rows.attempts[0] === undefined ? [] : await privateStreamEvents(rows.attempts[0].streamId, sessionId)
      expect(rows.runs[0]).toMatchObject({ cancellationKind: "requested", status: "aborted" })
      expect(rows.attempts[0]).toMatchObject({ status: "aborted" })
      expect(events.at(-1)).toMatchObject({
        eventType: "RUN_ERROR",
        payload: { code: "chat_aborted", type: "RUN_ERROR" },
      })
      expect(await messageRows(sessionId)).toMatchObject([
        { content: "cancel this deterministic scenario", role: "user" },
      ])
      expect(await messageRows(sessionId)).toHaveLength(1)
    } finally {
      rmSync(lifecycle.configDirectory, { force: true, recursive: true })
    }
  },
)

test.skipIf(!databaseAvailable)(
  "chat executes mocked OpenAI-compatible providers through durable delegation and replays without fetches",
  async () => {
    if (userId === undefined) return

    for (const provider of ["cliproxyapi", "codex-lb"] as const) {
      const sessionId = await sessionCreateForTest(
        userId,
        `Provider delegation ${provider}`,
        fixture.serverId,
        fixture.agentId,
      )
      const lifecycle = await providerConfigurationStoreForTest(provider)
      const secret = provider === "cliproxyapi" ? "cliproxy-secret" : "codex-secret"
      const environment = provider === "cliproxyapi" ? { CLIPROXYAPI_API_KEY: secret } : { CODEX_LB_API_TOKEN: secret }
      const requests: Array<Record<string, unknown>> = []
      const providerFetch: NonNullable<AppCreateOptions["providerFetch"]> = async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        requests.push(body)
        const messages = body.messages as Array<{ role: string }>
        const events =
          body.tools === undefined
            ? [
                {
                  choices: [{ delta: { content: "child result", role: "assistant" }, finish_reason: null, index: 0 }],
                  id: "child-text",
                  model: "provider-chat-model",
                  object: "chat.completion.chunk",
                },
                {
                  choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
                  id: "child-finish",
                  model: "provider-chat-model",
                  object: "chat.completion.chunk",
                },
              ]
            : messages.some((message) => message.role === "tool")
              ? [
                  {
                    choices: [
                      { delta: { content: "root complete", role: "assistant" }, finish_reason: null, index: 0 },
                    ],
                    id: "root-text",
                    model: "provider-chat-model",
                    object: "chat.completion.chunk",
                  },
                  {
                    choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
                    id: "root-finish",
                    model: "provider-chat-model",
                    object: "chat.completion.chunk",
                  },
                ]
              : [
                  {
                    choices: [
                      {
                        delta: {
                          role: "assistant",
                          tool_calls: [
                            {
                              function: { arguments: '{"task":"', name: "delegate_task" },
                              id: "provider-call",
                              index: 0,
                            },
                          ],
                        },
                        finish_reason: null,
                        index: 0,
                      },
                    ],
                    id: "root-tool-1",
                    model: "provider-chat-model",
                    object: "chat.completion.chunk",
                  },
                  {
                    choices: [
                      {
                        delta: { tool_calls: [{ function: { arguments: 'inspect child"}' }, index: 0 }] },
                        finish_reason: null,
                        index: 0,
                      },
                    ],
                    id: "root-tool-2",
                    model: "provider-chat-model",
                    object: "chat.completion.chunk",
                  },
                  {
                    choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }],
                    id: "root-tool-3",
                    model: "provider-chat-model",
                    object: "chat.completion.chunk",
                  },
                ]
        const source = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`
        return new Response(source, { headers: { "content-type": "text/event-stream" }, status: 200 })
      }

      try {
        const providerApp = appCreate({
          configuration,
          configurationStore: lifecycle.store,
          database,
          providerEnvironment: environment,
          providerFetch,
        })
        const runId = `session-chat-provider-delegation-${provider}-${uuidv7()}`
        const body = chatBody(sessionId, runId, "delegate:inspect child")
        const first = await providerApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
        const events = await sseEvents(first)
        const repeated = await providerApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })

        expect(first.status).toBe(200)
        expect(events.filter((event) => event.type === "RUN_STARTED")).toHaveLength(1)
        expect(events.filter((event) => event.type === "RUN_FINISHED")).toHaveLength(1)
        expect(events.some((event) => event.type === "TOOL_CALL_RESULT" && event.content === "child result")).toBe(true)
        expect(await sseEvents(repeated)).toEqual(events)
        expect(requests).toHaveLength(3)
        expect(requests[1]?.tools).toBeUndefined()
        expect(
          (requests[2]?.messages as Array<{ content: unknown; role: string }>).some(
            (message) => message.role === "tool" && message.content === "child result",
          ),
        ).toBe(true)
        expect(JSON.stringify(events)).not.toContain(secret)

        const rows = await delegationRows(sessionId, runId)
        expect(rows.childRows[0]?.runs[0]?.snapshot).toEqual(rows.rootRows.runs[0]?.snapshot)
        expect(rows.rootRows.runs[0]).toMatchObject({ status: "succeeded" })
        expect(await messageRows(sessionId)).toHaveLength(2)
      } finally {
        rmSync(lifecycle.configDirectory, { force: true, recursive: true })
      }
    }
  },
)
