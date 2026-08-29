import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { asc, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import type { ConfigurationStore } from "../src/configuration/configurationStore.js"
import { sessionCompactionGenerate } from "../src/compaction/actions/sessionCompactionGenerate.js"
import { sessionCompactionTable } from "../src/compaction/db/sessionCompactionTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseUrl } from "../src/database/databaseUrl.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import type { CliProxyApiAdapter, CliProxyApiAdapterInput } from "../src/providers/runtime/cliProxyApiAdapterCreate.js"
import type { ProviderRuntimeAdapterOptions } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { appSseTestDependenciesCreate } from "./appSseTestDependenciesCreate.js"

type OverflowMode = "abort" | "failed" | "retry-cap" | "revision-race" | "success"

const rootPath = await mkdtemp(path.join("/tmp", "codeline-session-overflow-recovery."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: "session-overflow-recovery-agent",
  organizationId: "session-overflow-recovery-user",
  serverId: "session-overflow-recovery-server",
  userId: "session-overflow-recovery-user",
}
const identityKey = `session-overflow-recovery-${uuidv7()}`
const cursor = journalCursorCodecCreate({ randomBytes, secret: `session-overflow-${uuidv7()}` })
if (!cursor.success) throw new Error(cursor.errorMessage)
const journalCursorCodec = cursor.data

const appConfiguration = {
  authMode: "development" as const,
  databaseUrl,
  developmentIdentity: { displayName: "Overflow Recovery User", identityKey },
  nodeEnv: "development" as const,
  oidcOrganizationId: fixture.userId,
}

const testDevelopmentIdentityUpsert = async () =>
  createResult({ displayName: appConfiguration.developmentIdentity.displayName, id: fixture.userId } as never)

function completedText(text: string): StreamChunk[] {
  return [
    { delta: text, messageId: "assistant", timestamp: 2, type: EventType.TEXT_MESSAGE_CONTENT },
    {
      finishReason: "stop",
      outcome: { type: "success" },
      timestamp: 3,
      type: EventType.RUN_FINISHED,
    },
  ] as StreamChunk[]
}

function overflowRuntimeAdapterCreate(
  mode: OverflowMode,
): (options: ProviderRuntimeAdapterOptions) => CliProxyApiAdapter {
  return (_options) => {
    let chatCalls = 0
    return (input: CliProxyApiAdapterInput) =>
      (async function* () {
        if (input.compaction) {
          if (mode === "abort") {
            await new Promise<void>((resolve) => {
              if (input.signal.aborted) {
                resolve()
                return
              }
              input.signal.addEventListener("abort", () => resolve(), { once: true })
            })
            return
          }
          if (mode === "failed") {
            yield {
              code: "provider_failed",
              message: "The summary provider failed.",
              timestamp: 1,
              type: EventType.RUN_ERROR,
            }
            return
          }
          if (mode === "revision-race") {
            const appended = await messageAppend(database, fixture.userId, input.sessionId, {
              clientRequestId: `${input.runId}-concurrent-message`,
              content: "Concurrent request during compaction.",
              role: "user",
            })
            if (!appended.success) throw new Error(appended.errorMessage)
          }
          yield* completedText("Compacted context summary.")
          return
        }

        chatCalls += 1
        if (chatCalls <= (mode === "retry-cap" ? 2 : 1)) {
          yield {
            code: "provider_context_overflow",
            message: "The provider context window was exceeded.",
            timestamp: 1,
            type: EventType.RUN_ERROR,
          }
          return
        }
        yield* completedText("Recovered response.")
      })()
  }
}

const noProgressCompactionGenerate: typeof sessionCompactionGenerate = async (..._args) =>
  createResult({}) as Awaited<ReturnType<typeof sessionCompactionGenerate>>

function overflowConfigurationStoreCreate(
  mode: OverflowMode,
  maxOverflowRetries = 1,
  auto = mode !== "abort",
  enabled = true,
): ConfigurationStore {
  return {
    gitStore: {} as never,
    snapshot: {
      configuration: {
        agentConfigurations: [
          {
            configuration: {
              compaction: {
                auto,
                enabled,
                maxOverflowRetries,
                maxSummaryTokens: 8,
                pressureThreshold: 0.8,
                recentTokenBudget: 1,
                reserveOutputTokens: 16,
              },
              model: `overflow-${mode}`,
              provider: "deterministic",
            },
            target: { agentId: fixture.agentId, serverId: fixture.serverId },
          },
        ],
        version: 1,
      },
      revision: `overflow-${mode}-configuration`,
    },
  } as ConfigurationStore
}

function overflowAppCreate(
  mode: OverflowMode,
  options: { auto?: boolean; enabled?: boolean; maxOverflowRetries?: number; noProgress?: boolean } = {},
) {
  return appCreate({
    ...appSseTestDependenciesCreate(journalCursorCodec),
    configuration: appConfiguration,
    configurationStore: overflowConfigurationStoreCreate(
      mode,
      options.maxOverflowRetries,
      options.auto,
      options.enabled,
    ),
    database,
    developmentIdentityUpsert: testDevelopmentIdentityUpsert,
    journalCursorCodec,
    providerRuntimeAdapterCreate: overflowRuntimeAdapterCreate(mode),
    ...(options.noProgress ? { sessionCompactionGenerate: noProgressCompactionGenerate } : {}),
  })
}

async function sessionCreate(app: ReturnType<typeof appCreate>): Promise<{ runId: string; sessionId: string }> {
  const created = await app.request("http://codeline.test/api/sessions", {
    body: JSON.stringify({
      clientRequestId: `overflow-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Context overflow recovery",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(created.status).toBe(201)
  const sessionId = ((await created.json()) as { session: { id: string } }).session.id
  const first = await messageAppend(database, fixture.userId, sessionId, {
    clientRequestId: `${sessionId}-old-user`,
    content: "An earlier user goal.",
    role: "user",
  })
  expect(first.success).toBe(true)
  const second = await messageAppend(database, fixture.userId, sessionId, {
    clientRequestId: `${sessionId}-old-assistant`,
    content: "An earlier assistant response.",
    role: "assistant",
  })
  expect(second.success).toBe(true)
  return { runId: `overflow-run-${uuidv7()}`, sessionId }
}

async function runWait(runId: string): Promise<typeof runTable.$inferSelect> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [run] = await database.select().from(runTable).where(eq(runTable.clientRunId, runId)).limit(1)
    if (run !== undefined && (run.status === "succeeded" || run.status === "failed" || run.status === "aborted"))
      return run
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Timed out waiting for run ${runId}.`)
}

async function chatStart(app: ReturnType<typeof appCreate>, sessionId: string, runId: string): Promise<Response> {
  return app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify({
      messages: [{ content: "Recover this context overflow.", id: `${runId}-prompt`, role: "user" }],
      runId,
      threadId: sessionId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values({ displayName: "Overflow Recovery User", id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.userId,
    id: fixture.userId,
    name: "Overflow Recovery Organization",
  })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: fixture.userId,
    subject: identityKey,
    userId: fixture.userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-overflow-recovery.test",
    id: fixture.serverId,
    name: "Overflow Recovery Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    configuration: { model: "overflow-agent", provider: "deterministic" },
    id: fixture.agentId,
    name: "Overflow Recovery Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterEach(async () => {
  await database.delete(sessionTable).where(eq(sessionTable.userId, fixture.userId))
})

afterAll(async () => {
  await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

test("recovers a context overflow with one same-logical-request retry", async () => {
  const app = overflowAppCreate("success")
  const { runId, sessionId } = await sessionCreate(app)
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  const run = await runWait(runId)
  const attempts = await database.select().from(attemptTable).where(eq(attemptTable.runId, run.id))
  const compactions = await database
    .select()
    .from(sessionCompactionTable)
    .where(eq(sessionCompactionTable.sessionId, sessionId))
  expect(run.status).toBe("succeeded")
  expect(attempts).toHaveLength(1)
  expect(compactions).toMatchObject([{ coveredSequence: 2, status: "succeeded" }])
})

test("forces overflow recovery when automatic compaction is disabled", async () => {
  const app = overflowAppCreate("success", { auto: false, enabled: false })
  const { runId, sessionId } = await sessionCreate(app)
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  const run = await runWait(runId)
  expect(run.status).toBe("succeeded")
  expect(
    await database.select().from(sessionCompactionTable).where(eq(sessionCompactionTable.sessionId, sessionId)),
  ).toHaveLength(1)
})

test("keeps the original overflow failure when compaction fails", async () => {
  const app = overflowAppCreate("failed")
  const { runId, sessionId } = await sessionCreate(app)
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  const run = await runWait(runId)
  expect(run).toMatchObject({ failure: { code: "provider_context_overflow" }, status: "failed" })
  expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, run.id))).toHaveLength(1)
})

test("does not retry when compaction makes no projection progress", async () => {
  const app = overflowAppCreate("success", { noProgress: true })
  const { runId, sessionId } = await sessionCreate(app)
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  const run = await runWait(runId)
  expect(run).toMatchObject({ failure: { code: "provider_context_overflow" }, status: "failed" })
  expect(
    await database.select().from(sessionCompactionTable).where(eq(sessionCompactionTable.sessionId, sessionId)),
  ).toHaveLength(0)
})

test("caps overflow retries independently of the generic attempt budget", async () => {
  const app = overflowAppCreate("retry-cap", { maxOverflowRetries: 1 })
  const { runId, sessionId } = await sessionCreate(app)
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  const run = await runWait(runId)
  const attempts = await database.select().from(attemptTable).where(eq(attemptTable.runId, run.id))
  expect(run).toMatchObject({ failure: { code: "provider_context_overflow" }, status: "failed" })
  expect(attempts).toHaveLength(1)
})

test("abort wins while overflow compaction is generating", async () => {
  const app = overflowAppCreate("abort")
  const { runId, sessionId } = await sessionCreate(app)
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [compaction] = await database
      .select()
      .from(sessionCompactionTable)
      .where(eq(sessionCompactionTable.sessionId, sessionId))
      .limit(1)
    if (compaction?.status === "running") break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  const cancelled = await app.request(`http://codeline.test/api/sessions/${sessionId}/runs/${runId}/cancel`, {
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(cancelled.status).toBe(200)
  const run = await runWait(runId)
  expect(run.status).toBe("aborted")
})

test("does not duplicate the durable user message during recovery", async () => {
  const app = overflowAppCreate("success")
  const { runId, sessionId } = await sessionCreate(app)
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  await runWait(runId)
  const messages = await database
    .select({ content: messageTable.content, role: messageTable.role })
    .from(messageTable)
    .where(eq(messageTable.sessionId, sessionId))
    .orderBy(asc(messageTable.sequence))
  expect(messages.filter((message) => message.content === "Recover this context overflow.")).toEqual([
    { content: "Recover this context overflow.", role: "user" },
  ])
})

test("does not retry overflow recovery after the source session revision changes", async () => {
  const app = overflowAppCreate("revision-race")
  const { runId, sessionId } = await sessionCreate(app)
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  const run = await runWait(runId)
  const attempts = await database.select().from(attemptTable).where(eq(attemptTable.runId, run.id))
  const compactions = await database
    .select()
    .from(sessionCompactionTable)
    .where(eq(sessionCompactionTable.sessionId, sessionId))

  expect(run).toMatchObject({ failure: { code: "provider_context_overflow" }, status: "failed" })
  expect(attempts).toHaveLength(1)
  expect(compactions).toMatchObject([{ status: "failed" }])
})
