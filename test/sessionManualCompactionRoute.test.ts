import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createResult, createResultError } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { asc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { appCreate } from "../src/app/appCreate.js"
import { sessionCompactionGenerate } from "../src/compaction/actions/sessionCompactionGenerate.js"
import type { ConfigurationStore } from "../src/configuration/configurationStore.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import type { CliProxyApiAdapter, CliProxyApiAdapterInput } from "../src/providers/runtime/cliProxyApiAdapterCreate.js"
import type { ProviderRuntimeAdapterOptions } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { apiSessionRoutesAdd } from "../src/session/api/apiSessionRoutesAdd.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { appSseTestDependenciesCreate } from "./appSseTestDependenciesCreate.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-manual-compaction-route."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: "manual-compaction-route-agent",
  organizationId: "manual-compaction-route-organization",
  serverId: "manual-compaction-route-server",
  userId: "manual-compaction-route-user",
}
const identityKey = `manual-compaction-route-${uuidv7()}`
const appConfiguration = {
  authMode: "development" as const,
  databaseUrl: databasePath,
  developmentIdentity: { displayName: "Manual Compaction Route User", identityKey },
  nodeEnv: "development" as const,
  oidcOrganizationId: fixture.organizationId,
}
const cursor = journalCursorCodecCreate({ randomBytes, secret: `manual-compaction-route-${uuidv7()}` })
if (!cursor.success) throw new Error(cursor.errorMessage)
const journalCursorCodec = cursor.data
const testDevelopmentIdentityUpsert = async () =>
  createResult({ displayName: appConfiguration.developmentIdentity.displayName, id: fixture.userId } as never)

function configurationStoreCreate(auto = true): ConfigurationStore {
  return {
    gitStore: {} as never,
    snapshot: {
      configuration: {
        agentConfigurations: [
          {
            configuration: {
              compaction: {
                auto,
                enabled: true,
                maxSummaryTokens: 1_024,
                pressureThreshold: 0.8,
                recentTokenBudget: 1,
                reserveOutputTokens: 1_024,
              },
              model: `manual-compaction-${auto ? "auto" : "manual"}`,
              provider: "deterministic",
            },
            target: { agentId: fixture.agentId, serverId: fixture.serverId },
          },
        ],
        version: 1,
      },
      revision: `manual-compaction-${auto ? "auto" : "manual"}-revision`,
    },
  }
}

function manualCompactionAppCreate(
  options: {
    auto?: boolean
    providerRuntimeAdapterCreate?: (options: ProviderRuntimeAdapterOptions) => CliProxyApiAdapter
    sessionCompactionGenerate?: typeof sessionCompactionGenerate
  } = {},
) {
  return appCreate({
    ...appSseTestDependenciesCreate(journalCursorCodec),
    configuration: appConfiguration,
    configurationStore: configurationStoreCreate(options.auto),
    database,
    developmentIdentityUpsert: testDevelopmentIdentityUpsert,
    journalCursorCodec,
    ...(options.providerRuntimeAdapterCreate === undefined
      ? {}
      : { providerRuntimeAdapterCreate: options.providerRuntimeAdapterCreate }),
    ...(options.sessionCompactionGenerate === undefined
      ? {}
      : { sessionCompactionGenerate: options.sessionCompactionGenerate }),
  })
}

async function sessionCreate(): Promise<{ sessionId: string; runId: string }> {
  const app = manualCompactionAppCreate()
  const created = await app.request("http://codeline.test/api/sessions", {
    body: JSON.stringify({
      clientRequestId: `manual-compaction-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Manual compaction route",
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
  return { runId: `manual-compaction-run-${uuidv7()}`, sessionId }
}

async function chatStart(app: ReturnType<typeof appCreate>, sessionId: string, runId: string, content = "/compact") {
  return app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify({
      messages: [{ content, id: `${runId}-prompt`, role: "user" }],
      runId,
      threadId: sessionId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

async function runWait(clientRunId: string): Promise<typeof runTable.$inferSelect> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [run] = await database.select().from(runTable).where(eq(runTable.clientRunId, clientRunId)).limit(1)
    if (run !== undefined && (run.status === "succeeded" || run.status === "failed" || run.status === "aborted"))
      return run
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Timed out waiting for run ${clientRunId}.`)
}

function summaryAdapterCreate(observed: CliProxyApiAdapterInput[]) {
  return (_options: ProviderRuntimeAdapterOptions): CliProxyApiAdapter =>
    (input: CliProxyApiAdapterInput) =>
      (async function* () {
        observed.push(input)
        yield* [
          {
            delta: "Manual compaction summary.",
            messageId: "summary",
            timestamp: 1,
            type: EventType.TEXT_MESSAGE_CONTENT,
          },
          {
            finishReason: "stop",
            outcome: { type: "success" },
            timestamp: 2,
            type: EventType.RUN_FINISHED,
          },
        ] as StreamChunk[]
      })()
}

beforeAll(async () => {
  await database
    .insert(applicationUserTable)
    .values({ displayName: "Manual Compaction Route User", id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: "Manual Compaction Route Organization",
  })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: fixture.organizationId,
    subject: identityKey,
    userId: fixture.userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://manual-compaction-route.test",
    id: fixture.serverId,
    name: "Manual Compaction Route Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    configuration: { model: "manual-compaction-agent", provider: "deterministic" },
    id: fixture.agentId,
    name: "Manual Compaction Route Agent",
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

test("the exact manual command compacts through the admitted run lifecycle", async () => {
  const app = manualCompactionAppCreate()
  const { runId, sessionId } = await sessionCreate()
  expect((await chatStart(app, sessionId, runId, "  /compact \n")).status).toBe(200)

  const run = await runWait(runId)
  expect(run.status).toBe("succeeded")
  expect(
    await database
      .select()
      .from(messageTable)
      .where(eq(messageTable.sessionId, sessionId))
      .orderBy(asc(messageTable.sequence)),
  ).toMatchObject([
    { content: "An earlier user goal.", role: "user" },
    { content: "An earlier assistant response.", role: "assistant" },
  ])
  expect(
    await database
      .select({ eventType: journalEventTable.eventType })
      .from(journalEventTable)
      .where(eq(journalEventTable.runId, run.id)),
  ).toContainEqual({ eventType: "run-completed" })
})

test("manual compaction succeeds when automatic compaction is disabled", async () => {
  const app = manualCompactionAppCreate({ auto: false })
  const { runId, sessionId } = await sessionCreate()
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)

  expect((await runWait(runId)).status).toBe("succeeded")
})

test("manual compaction does not persist or forward the command prompt", async () => {
  const observed: CliProxyApiAdapterInput[] = []
  const app = manualCompactionAppCreate({ providerRuntimeAdapterCreate: summaryAdapterCreate(observed) })
  const { runId, sessionId } = await sessionCreate()
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)
  expect((await runWait(runId)).status).toBe("succeeded")

  expect(observed).toHaveLength(1)
  expect(observed[0]).toMatchObject({ compaction: true, history: [], tools: [] })
  expect(observed[0]?.prompt).not.toContain("/compact")
  expect(
    (
      await database
        .select({ content: messageTable.content })
        .from(messageTable)
        .where(eq(messageTable.sessionId, sessionId))
    ).some(({ content }) => content === "/compact"),
  ).toBe(false)
})

test("manual compaction preserves authorization and archive rejection", async () => {
  const app = manualCompactionAppCreate()
  const { runId, sessionId } = await sessionCreate()
  let compactionCalls = 0
  const unauthorizedApi = new Hono<AppEnvironment>()
  unauthorizedApi.use("*", async (context, next) => {
    context.set("database", database)
    context.set("requestIdentity", { organizationId: "other-organization", userId: fixture.userId })
    await next()
  })
  const dependencies = appSseTestDependenciesCreate(journalCursorCodec)
  apiSessionRoutesAdd(unauthorizedApi, {
    ...dependencies,
    database,
    journalCursorCodec,
    sessionCompactionGenerate: async (...args) => {
      compactionCalls += 1
      return sessionCompactionGenerate(...args)
    },
  })
  expect((await chatStart(unauthorizedApi as never, sessionId, runId)).status).toBe(404)

  const session = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  const archived = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, {
    headers: { "If-Match": session.headers.get("ETag") as string },
    method: "POST",
  })
  expect(archived.status).toBe(200)
  expect((await chatStart(app, sessionId, `manual-compaction-archived-${uuidv7()}`)).status).toBe(409)
  expect(compactionCalls).toBe(0)
})

test("manual compaction publishes an established failure for busy generation", async () => {
  const app = manualCompactionAppCreate({
    sessionCompactionGenerate: async () =>
      createResultError("sessionCompactionGenerate", "A compaction is already active for the session."),
  })
  const { runId, sessionId } = await sessionCreate()
  expect((await chatStart(app, sessionId, runId)).status).toBe(200)

  const run = await runWait(runId)
  expect(run).toMatchObject({
    failure: { code: "compaction_failed", message: "A compaction is already active for the session." },
    status: "failed",
  })
  expect(
    await database
      .select({ eventType: journalEventTable.eventType })
      .from(journalEventTable)
      .where(eq(journalEventTable.runId, run.id)),
  ).toContainEqual({ eventType: "run-failed" })
})

test("commands with arguments or similar names remain on the generic command path", async () => {
  const app = manualCompactionAppCreate({
    sessionCompactionGenerate: async () => createResult({}) as never,
  })
  const { runId, sessionId } = await sessionCreate()
  expect((await chatStart(app, sessionId, `manual-compaction-argument-${uuidv7()}`, "/compact extra")).status).toBe(400)
  expect((await chatStart(app, sessionId, `manual-compaction-similar-${uuidv7()}`, "/compactly")).status).toBe(400)
  expect(await database.select().from(runTable).where(eq(runTable.sessionId, sessionId))).toHaveLength(0)
})
