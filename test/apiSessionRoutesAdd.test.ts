import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { type AnyTextAdapter, EventType } from "@tanstack/ai"
import { asc, eq } from "drizzle-orm"
import { Hono } from "hono"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { appCreate } from "../src/app/appCreate.js"
import type { ConfigurationStore } from "../src/configuration/configurationStore.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseUrl } from "../src/database/databaseUrl.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { providerDelegationToolLoopCreate } from "../src/providers/runtime/providerDelegationToolLoopCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionChatAdapterCreate } from "../src/session/actions/sessionChatAdapterCreate.js"
import { apiSessionRoutesAdd } from "../src/session/api/apiSessionRoutesAdd.js"
import { sessionChatCommandResponseSchema } from "../src/session/api/sessionChatCommandResponseSchema.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { appSseTestDependenciesCreate } from "./appSseTestDependenciesCreate.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const identityKey = `session-http-user-${uuidv7()}`
const userId = `development:${identityKey}`
const serverId = `session-http-server-${uuidv7()}`
const agentId = `session-http-agent-${uuidv7()}`
const configuration = {
  authMode: "development" as const,
  databaseUrl,
  developmentIdentity: {
    displayName: "Session HTTP Test User",
    identityKey,
  },
  nodeEnv: "development" as const,
  oidcOrganizationId: userId,
}
const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `session-http-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)
const testDevelopmentIdentityUpsert = async () =>
  createResult({ displayName: configuration.developmentIdentity.displayName, id: userId } as never)
const app = appCreate({
  ...appSseTestDependenciesCreate(journalCursorCodec.data),
  configuration,
  database,
  developmentIdentityUpsert: testDevelopmentIdentityUpsert,
  journalCursorCodec: journalCursorCodec.data,
  sessionChatAdapter: sessionChatAdapterCreate,
})
const runConfigurationStore = {
  gitStore: {} as never,
  snapshot: {
    configuration: {
      agentConfigurations: [
        {
          configuration: { model: "session-http-deterministic", provider: "deterministic" },
          target: { agentId, serverId },
        },
      ],
      version: 1,
    },
    revision: "session-http-configuration-revision",
  },
} satisfies ConfigurationStore

function nestedProviderDelegationToolLoopCreate(options: Parameters<typeof providerDelegationToolLoopCreate>[0]) {
  const adapter: AnyTextAdapter = {
    ...options.adapter,
    chatStream: (input) =>
      (async function* () {
        // Make the nested API regression exercise result handoff instead of a provider-written continuation.
        const continuation = input.messages.some((message) => message.role === "tool")
        for await (const chunk of options.adapter.chatStream(input)) {
          if (
            continuation &&
            (chunk.type === EventType.TEXT_MESSAGE_START ||
              chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
              chunk.type === EventType.TEXT_MESSAGE_END)
          )
            continue
          yield chunk
        }
      })(),
  }
  return providerDelegationToolLoopCreate({ ...options, adapter })
}

const runApp = appCreate({
  ...appSseTestDependenciesCreate(journalCursorCodec.data),
  configuration,
  configurationStore: runConfigurationStore,
  database,
  developmentIdentityUpsert: testDevelopmentIdentityUpsert,
  journalCursorCodec: journalCursorCodec.data,
})
const nestedRunApp = appCreate({
  ...appSseTestDependenciesCreate(journalCursorCodec.data),
  configuration,
  configurationStore: runConfigurationStore,
  database,
  developmentIdentityUpsert: testDevelopmentIdentityUpsert,
  journalCursorCodec: journalCursorCodec.data,
  providerDelegationToolLoopCreate: nestedProviderDelegationToolLoopCreate,
  runCreate: (database, userId, sessionId, input) =>
    runCreate(database, userId, sessionId, {
      ...input,
      budget: { ...input.budget, maxChildDepth: 2, maxChildRuns: 2 },
    }),
})

test("requires the authenticated session cursor and journal dependencies at construction", () => {
  expect(() =>
    apiSessionRoutesAdd(new Hono<AppEnvironment>(), {
      database,
      journalPostCommitPublish: async () => createResult(undefined),
    } as never),
  ).toThrow("The authenticated session cursor codec is required.")
})

async function responseJsonRead(response: Response): Promise<unknown> {
  const bytes = new Uint8Array(await response.arrayBuffer())
  const encoding = response.headers.get("Content-Encoding")
  if (encoding === "gzip" || encoding === "deflate") {
    const decompressed = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(encoding)))
    return decompressed.json()
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

beforeAll(async () => {
  if (!databaseAvailable) return

  const user = await developmentIdentityUpsert(database, {
    displayName: "Session HTTP Test User",
    identityKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  await database.insert(organizationTable).values({ id: userId, externalId: userId, name: "Session HTTP Organization" })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: userId,
    subject: identityKey,
    userId,
  })

  await database.insert(serverTable).values({
    endpoint: "http://session-http-server.test",
    id: serverId,
    name: "Session HTTP Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({
    id: agentId,
    name: "Session HTTP Agent",
    role: "coding",
    serverId,
  })
})

afterAll(async () => {
  if (databaseAvailable) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
})

afterEach(async () => {
  if (databaseAvailable) await database.delete(sessionTable).where(eq(sessionTable.userId, userId))
})

test.skipIf(!databaseAvailable)(
  "session HTTP routes implement create, read, list, rename, archive, and delete",
  async () => {
    const input = {
      clientRequestId: `session-http-request-${uuidv7()}`,
      metadata: { project: "codeline" },
      primaryAgentId: agentId,
      serverId,
      title: "HTTP session",
    }

    const created = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const createdBody = await created.json()
    expect(created.status).toBe(201)
    expect(createdBody).toMatchObject({
      created: true,
      session: { pinned: true, projectPath: "~", title: "HTTP session" },
    })
    const sessionId = createdBody.session.id as string

    const repeated = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({ ...input, title: "Changed by retry" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(repeated.status).toBe(409)
    expect(await repeated.json()).toMatchObject({ error: { code: "conflict" } })

    const loaded = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
    expect(loaded.status).toBe(200)
    expect(await loaded.json()).toMatchObject({
      session: { id: sessionId },
      server: { id: serverId },
      agent: { id: agentId },
    })
    let sessionEtag = loaded.headers.get("ETag") as string

    const renamed = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Renamed HTTP session" }),
      headers: { "Content-Type": "application/json", "If-Match": sessionEtag },
      method: "PATCH",
    })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ session: { title: "Renamed HTTP session" } })
    sessionEtag = (await app.request(`http://codeline.test/api/sessions/${sessionId}`)).headers.get("ETag") as string

    const unpinned = await app.request(`http://codeline.test/api/sessions/${sessionId}/pin`, {
      body: JSON.stringify({ pinned: false }),
      headers: { "Content-Type": "application/json", "If-Match": sessionEtag },
      method: "PATCH",
    })
    expect(unpinned.status).toBe(200)
    expect(await unpinned.json()).toMatchObject({ session: { id: sessionId, pinned: false } })
    sessionEtag = (await app.request(`http://codeline.test/api/sessions/${sessionId}`)).headers.get("ETag") as string

    const archived = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, {
      headers: { "If-Match": sessionEtag },
      method: "POST",
    })
    expect(archived.status).toBe(200)
    expect(await archived.json()).toMatchObject({ session: { id: sessionId, archivedAt: expect.any(String) } })
    sessionEtag = (await app.request(`http://codeline.test/api/sessions/${sessionId}?includeArchived=1`)).headers.get(
      "ETag",
    ) as string

    const pinArchived = await app.request(`http://codeline.test/api/sessions/${sessionId}/pin`, {
      body: JSON.stringify({ pinned: true }),
      headers: { "Content-Type": "application/json", "If-Match": sessionEtag },
      method: "PATCH",
    })
    expect(pinArchived.status).toBe(409)

    const defaultList = await app.request("http://codeline.test/api/sessions")
    expect(defaultList.status).toBe(200)
    expect(await defaultList.json()).toMatchObject({ sessions: [] })
    const archivedList = await app.request("http://codeline.test/api/sessions?includeArchived=1")
    expect(archivedList.status).toBe(200)
    expect(await archivedList.json()).toMatchObject({ sessions: [{ id: sessionId }] })

    sessionEtag = (await app.request(`http://codeline.test/api/sessions/${sessionId}?includeArchived=1`)).headers.get(
      "ETag",
    ) as string
    const deleted = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      headers: { "If-Match": sessionEtag },
      method: "DELETE",
    })
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toMatchObject({ session: { id: sessionId } })
    const missing = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
    expect(missing.status).toBe(404)
  },
)

test.skipIf(!databaseAvailable)(
  "session action routes return selected representations and replay Drizzle retries",
  async () => {
    const created = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({
        clientRequestId: `session-http-task4-${uuidv7()}`,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Task 4 action session",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { session: { id: string } }
    const sessionId = createdBody.session.id
    const loaded = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
    const initialEtag = loaded.headers.get("ETag") as string

    const unauthorizedApi = new Hono<AppEnvironment>()
    unauthorizedApi.use("*", async (context, next) => {
      context.set("database", database)
      context.set("requestIdentity", { organizationId: "other-organization", userId })
      await next()
    })
    apiSessionRoutesAdd(unauthorizedApi, {
      database,
      journalCursorCodec: {
        decode: (cursor) => createResult({ journalId: String(cursor), sequence: 0, version: 1 }),
        encode: (journalId, sequence) => createResult(`cursor-${journalId}-${sequence}`),
        encodeDeterministic: (journalId, sequence) => createResult(`cursor-${journalId}-${sequence}`),
        validate: (cursor, journalId) =>
          createResult({ journalId: String(journalId), sequence: Number(cursor), version: 1 }),
      },
      journalPostCommitPublish: async () => createResult(undefined),
    })
    for (const [path, method, body] of [
      [`/sessions/${sessionId}/pin`, "PATCH", JSON.stringify({ pinned: false })],
      [`/sessions/${sessionId}/archive`, "POST", undefined],
      [`/sessions/${sessionId}`, "DELETE", undefined],
    ] as const) {
      const unauthorized = await unauthorizedApi.request(`http://codeline.test${path}`, {
        body,
        headers:
          body === undefined
            ? { "If-Match": initialEtag }
            : { "Content-Type": "application/json", "If-Match": initialEtag },
        method,
      })
      expect(unauthorized.status).toBe(404)
    }

    const missingPin = await app.request(`http://codeline.test/api/sessions/${sessionId}/pin`, {
      body: JSON.stringify({ pinned: false }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(missingPin.status).toBe(412)

    const malformedPin = await app.request(`http://codeline.test/api/sessions/${sessionId}/pin`, {
      body: JSON.stringify({ pinned: false }),
      headers: { "Content-Type": "application/json", "If-Match": "not-an-etag" },
      method: "PATCH",
    })
    expect(malformedPin.status).toBe(400)
    expect(await malformedPin.json()).toMatchObject({ error: { code: "bad_request" } })

    const pinKey = `session-http-pin-${uuidv7()}`
    const pinned = await app.request(`http://codeline.test/api/sessions/${sessionId}/pin`, {
      body: JSON.stringify({ pinned: false }),
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "Content-Type": "application/json",
        "Idempotency-Key": pinKey,
        "If-Match": initialEtag,
      },
      method: "PATCH",
    })
    expect(pinned.status).toBe(200)
    expect(pinned.headers.get("Content-Encoding")).toBe("gzip")
    expect(pinned.headers.get("Cache-Control")).toBe("private, no-cache")
    expect(pinned.headers.get("Vary")).toBe("Cookie, Accept-Encoding")
    const pinnedBytes = await pinned.clone().arrayBuffer()
    expect(pinned.headers.get("Content-Length")).toBe(String(pinnedBytes.byteLength))
    const pinnedBody = (await responseJsonRead(pinned)) as {
      etag: string
      revision: number
      session: { pinned: boolean }
    }
    expect(pinned.headers.get("ETag")).toBe(pinnedBody.etag)
    expect(pinned.headers.get("Idempotency-Replayed")).toBe("false")
    expect(pinnedBody).toMatchObject({ revision: 2, session: { pinned: false } })

    const pinReplay = await app.request(`http://codeline.test/api/sessions/${sessionId}/pin`, {
      body: JSON.stringify({ pinned: false }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": pinKey, "If-Match": initialEtag },
      method: "PATCH",
    })
    expect(pinReplay.status).toBe(200)
    expect(pinReplay.headers.get("Idempotency-Replayed")).toBe("true")
    expect(await responseJsonRead(pinReplay)).toEqual(pinnedBody)

    const pinConflict = await app.request(`http://codeline.test/api/sessions/${sessionId}/pin`, {
      body: JSON.stringify({ pinned: true }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": pinKey, "If-Match": initialEtag },
      method: "PATCH",
    })
    expect(pinConflict.status).toBe(409)

    const archiveMissing = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, {
      method: "POST",
    })
    expect(archiveMissing.status).toBe(412)
    const archiveStale = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, {
      headers: { "If-Match": initialEtag },
      method: "POST",
    })
    expect(archiveStale.status).toBe(412)

    const archiveKey = `session-http-archive-${uuidv7()}`
    const archived = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, {
      headers: {
        "Accept-Encoding": "deflate",
        "Idempotency-Key": archiveKey,
        "If-Match": pinnedBody.etag,
      },
      method: "POST",
    })
    expect(archived.status).toBe(200)
    expect(archived.headers.get("Content-Encoding")).toBe("deflate")
    const archivedBody = (await responseJsonRead(archived)) as { etag: string; revision: number }
    expect(archived.headers.get("ETag")).toBe(archivedBody.etag)
    expect(archived.headers.get("Idempotency-Replayed")).toBe("false")
    expect(archivedBody.revision).toBe(3)

    const archiveReplay = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, {
      headers: { "Idempotency-Key": archiveKey, "If-Match": pinnedBody.etag },
      method: "POST",
    })
    expect(archiveReplay.status).toBe(200)
    expect(archiveReplay.headers.get("Idempotency-Replayed")).toBe("true")
    expect(await responseJsonRead(archiveReplay)).toEqual(archivedBody)

    const deleteMissing = await app.request(`http://codeline.test/api/sessions/${sessionId}`, { method: "DELETE" })
    expect(deleteMissing.status).toBe(412)
    const malformedDelete = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      headers: { "If-Match": "malformed" },
      method: "DELETE",
    })
    expect(malformedDelete.status).toBe(400)

    const deleteKey = `session-http-delete-${uuidv7()}`
    const deleted = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      headers: { "Accept-Encoding": "gzip", "Idempotency-Key": deleteKey, "If-Match": archivedBody.etag },
      method: "DELETE",
    })
    expect(deleted.status).toBe(200)
    expect(deleted.headers.get("ETag")).toBeNull()
    expect(deleted.headers.get("Content-Encoding")).toBe("gzip")
    expect(deleted.headers.get("Vary")).toBe("Cookie, Accept-Encoding")
    const deletedBytes = await deleted.clone().arrayBuffer()
    expect(deleted.headers.get("Content-Length")).toBe(String(deletedBytes.byteLength))
    expect(deleted.headers.get("Idempotency-Replayed")).toBe("false")
    expect(await responseJsonRead(deleted)).toMatchObject({ deleted: true, session: { id: sessionId, revision: 3 } })

    const deleteReplay = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      headers: { "Idempotency-Key": deleteKey, "If-Match": archivedBody.etag },
      method: "DELETE",
    })
    expect(deleteReplay.status).toBe(200)
    expect(deleteReplay.headers.get("Idempotency-Replayed")).toBe("true")
    expect(await responseJsonRead(deleteReplay)).toMatchObject({ deleted: true, session: { id: sessionId } })
  },
)

test.skipIf(!databaseAvailable)("session HTTP routes validate requests and cursors", async () => {
  const arbitraryParent = await app.request("http://codeline.test/api/sessions", {
    body: JSON.stringify({
      clientRequestId: `session-http-parent-rejected-${uuidv7()}`,
      metadata: {},
      parentSessionId: "arbitrary-parent",
      primaryAgentId: agentId,
      serverId,
      title: "Must reject arbitrary parent",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(arbitraryParent.status).toBe(400)

  const invalidCreate = await app.request("http://codeline.test/api/sessions", {
    body: JSON.stringify({ title: "missing identifiers" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(invalidCreate.status).toBe(400)
  expect(await invalidCreate.json()).toMatchObject({ error: { code: "bad_request" } })

  const invalidProject = await app.request("http://codeline.test/api/sessions", {
    body: JSON.stringify({
      clientRequestId: `session-http-invalid-project-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      projectPath: "/",
      serverId,
      title: "Invalid project path",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(invalidProject.status).toBe(400)
  expect(await invalidProject.json()).toMatchObject({ error: { code: "bad_request" } })

  const invalidQuery = await app.request("http://codeline.test/api/sessions?limit=0")
  expect(invalidQuery.status).toBe(400)
  expect(await invalidQuery.json()).toMatchObject({ error: { code: "bad_request" } })

  const invalidCursor = await app.request("http://codeline.test/api/sessions?cursor=invalid")
  expect(invalidCursor.status).toBe(400)
  expect(await invalidCursor.json()).toMatchObject({ error: { code: "bad_request" } })
})

test.skipIf(!databaseAvailable)(
  "session chat HTTP returns a command response and persists prepared messages",
  async () => {
    const created = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({
        clientRequestId: `session-chat-http-${uuidv7()}`,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "HTTP chat persistence",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(created.status).toBe(201)
    const sessionId = ((await created.json()) as { session: { id: string } }).session.id
    const runId = `session-chat-http-run-${uuidv7()}`
    const response = await app.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify({
        context: [],
        forwardedProps: {},
        messages: [{ content: "Persist this chat", id: `prompt-${runId}`, role: "user" }],
        runId,
        state: {},
        threadId: sessionId,
        tools: [],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("application/json")
    expect(await response.json()).toEqual({ runId, sessionId })

    let messages = await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))
    for (let attempt = 0; attempt < 100 && messages.length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      messages = await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))
    }
    expect(messages).toMatchObject([
      { content: "Persist this chat", role: "user", sequence: 1 },
      { content: "Deterministic response: Persist this chat", role: "assistant", sequence: 2 },
    ])
  },
)

test.skipIf(!databaseAvailable)(
  "session chat admits runs from the persisted execution selection instead of caller tool configuration",
  async () => {
    const selectedSubagentId = `session-http-selected-subagent-${uuidv7()}`
    const created = await runApp.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({
        clientRequestId: `session-chat-selection-${uuidv7()}`,
        executionSelection: {
          tools: {
            primary: { agentId, tools: { bash: true, webfetch: false } },
            selectableSubagents: [{ agentId: selectedSubagentId, tools: { bash: false, webfetch: true } }],
          },
          version: 1,
        },
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Persisted execution selection",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(created.status).toBe(201)
    const sessionId = ((await created.json()) as { session: { id: string } }).session.id
    const runId = `session-chat-selection-run-${uuidv7()}`
    const response = await runApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify({
        forwardedProps: { codelineExecution: { model: "forwarded-model", provider: "deterministic" } },
        messages: [{ content: "Use the persisted selection", id: `prompt-${runId}`, role: "user" }],
        runId,
        threadId: sessionId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(response.status).toBe(200)

    const [run] = await database.select().from(runTable).where(eq(runTable.sessionId, sessionId))
    expect(run).toMatchObject({ snapshot: { configuration: { model: "forwarded-model" } } })
    expect(run?.snapshot).toMatchObject({
      configuration: { tools: { bash: true, webfetch: false } },
      executionManifest: {
        tools: {
          primary: { agentId, tools: ["bash", "skill", "delegate_task"] },
          selectableSubagents: [{ agentId: selectedSubagentId, tools: ["webfetch", "skill", "delegate_task"] }],
        },
      },
    })
    const attempts = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, run?.id ?? ""))
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.snapshot.executionManifest).toEqual(run?.snapshot.executionManifest)
  },
)

test.skipIf(!databaseAvailable)(
  "session chat rejects an invalid persisted execution selection before run admission",
  async () => {
    const created = await runApp.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({
        clientRequestId: `session-chat-invalid-selection-${uuidv7()}`,
        executionSelection: {
          tools: {
            primary: { agentId, tools: { bash: true, webfetch: false } },
            selectableSubagents: [],
          },
          version: 1,
        },
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Invalid persisted execution selection",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(created.status).toBe(201)
    const sessionId = ((await created.json()) as { session: { id: string } }).session.id
    await database
      .update(sessionTable)
      .set({
        executionSelection: {
          tools: {
            primary: { agentId: "different-agent", tools: { bash: false, webfetch: false } },
            selectableSubagents: [],
          },
          version: 1,
        } as never,
      })
      .where(eq(sessionTable.id, sessionId))

    const runId = `session-chat-invalid-selection-run-${uuidv7()}`
    const response = await runApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify({
        messages: [{ content: "This must not be admitted", id: `prompt-${runId}`, role: "user" }],
        runId,
        threadId: sessionId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(response.status).toBe(400)
    expect(await database.select().from(runTable).where(eq(runTable.sessionId, sessionId))).toHaveLength(0)
  },
)

test.skipIf(!databaseAvailable)(
  "session chat keeps a delegated subagent's second ping delegation on the child run",
  async () => {
    const created = await nestedRunApp.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({
        clientRequestId: `session-chat-nested-delegation-${uuidv7()}`,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Nested delegation",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(created.status).toBe(201)
    const sessionId = ((await created.json()) as { session: { id: string } }).session.id
    const runId = `session-chat-nested-delegation-run-${uuidv7()}`
    const response = await nestedRunApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify({
        context: [],
        forwardedProps: {},
        // The deterministic runtime turns this into root -> `delegate:ping` -> `ping`.
        messages: [{ content: "delegate:delegate:ping", id: `prompt-${runId}`, role: "user" }],
        runId,
        state: {},
        threadId: sessionId,
        tools: [],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(response.status).toBe(200)

    let delegations = await database
      .select()
      .from(runDelegationTable)
      .where(eq(runDelegationTable.sessionId, sessionId))
      .orderBy(asc(runDelegationTable.createdAt), asc(runDelegationTable.id))
    const delegationsDeadline = Date.now() + 3_000
    while (delegations.length < 2 && Date.now() < delegationsDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      delegations = await database
        .select()
        .from(runDelegationTable)
        .where(eq(runDelegationTable.sessionId, sessionId))
        .orderBy(asc(runDelegationTable.createdAt), asc(runDelegationTable.id))
    }
    if (delegations.length < 2) {
      throw new Error(
        `Timed out waiting 3 seconds for two nested delegations for session ${sessionId}; observed ${JSON.stringify(delegations)}`,
      )
    }

    let messages = await database
      .select({ content: messageTable.content, role: messageTable.role })
      .from(messageTable)
      .where(eq(messageTable.sessionId, sessionId))
      .orderBy(asc(messageTable.sequence))
    const messagesDeadline = Date.now() + 3_000
    while (!messages.some((message) => message.role === "assistant") && Date.now() < messagesDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      messages = await database
        .select({ content: messageTable.content, role: messageTable.role })
        .from(messageTable)
        .where(eq(messageTable.sessionId, sessionId))
        .orderBy(asc(messageTable.sequence))
    }
    if (!messages.some((message) => message.role === "assistant")) {
      throw new Error(
        `Timed out waiting 3 seconds for the nested assistant message for session ${sessionId}; observed ${JSON.stringify(messages)}`,
      )
    }
    expect(messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual([
      "Deterministic response: ping",
    ])

    expect(delegations).toHaveLength(2)
    expect(delegations.map((delegation) => delegation.task)).toEqual(["delegate:ping", "ping"])
    expect(delegations[1]?.parentRunId).toBe(delegations[0]?.childRunId)
    expect(delegations[1]?.parentAttemptId).not.toBe(delegations[0]?.parentAttemptId)
  },
)

test.skipIf(!databaseAvailable)(
  "session chat HTTP deduplicates concurrent prompt retries into one typed command and durable run",
  async () => {
    const created = await runApp.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({
        clientRequestId: `session-chat-idempotency-${uuidv7()}`,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "HTTP chat idempotency",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(created.status).toBe(201)
    const sessionId = ((await created.json()) as { session: { id: string } }).session.id
    const idempotencyKey = `session-chat-prompt-${uuidv7()}`
    const request = () =>
      runApp.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
        body: JSON.stringify({
          context: [],
          forwardedProps: {},
          messages: [{ content: "Deduplicate this prompt", id: `prompt-${idempotencyKey}`, role: "user" }],
          runId: idempotencyKey,
          state: {},
          threadId: sessionId,
          tools: [],
        }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        method: "POST",
      })

    const responses = await Promise.all([request(), request()])
    const responseBodies = []
    for (const response of responses) {
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(v.safeParse(sessionChatCommandResponseSchema, body).success).toBe(true)
      responseBodies.push(body)
    }
    expect(responseBodies[0]).toEqual(responseBodies[1])
    expect(responseBodies[0]).toMatchObject({ sessionId })

    const retry = await request()
    expect(retry.status).toBe(200)
    expect(await retry.json()).toEqual(responseBodies[0])

    const runs = await database.select().from(runTable).where(eq(runTable.sessionId, sessionId))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ clientRunId: idempotencyKey, sessionId, userId })
    const attempts = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, runs[0]?.id ?? ""))
    expect(attempts).toHaveLength(1)
    const messages = await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))
    expect(messages.filter((message) => message.clientRequestId === idempotencyKey)).toHaveLength(1)
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1)
  },
)

test.skipIf(!databaseAvailable)("session and message HTTP routes persist the complete lifecycle", async () => {
  const input = {
    clientRequestId: `session-flow-request-${uuidv7()}`,
    metadata: { project: "codeline" },
    primaryAgentId: agentId,
    serverId,
    title: "Persistence flow",
  }

  const created = await app.request("http://codeline.test/api/sessions", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(created.status).toBe(201)
  const createdBody = await created.json()
  const sessionId = createdBody.session.id as string

  const userMessage = await app.request(`http://codeline.test/api/sessions/${sessionId}/messages`, {
    body: JSON.stringify({
      clientRequestId: `session-flow-user-${uuidv7()}`,
      content: "Please inspect this persistence flow.",
      role: "user",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(userMessage.status).toBe(201)
  expect(await userMessage.json()).toMatchObject({ message: { role: "user", sequence: 1 } })

  const assistantMessage = await app.request(`http://codeline.test/api/sessions/${sessionId}/messages`, {
    body: JSON.stringify({
      clientRequestId: `session-flow-assistant-${uuidv7()}`,
      content: "The persistence flow is complete.",
      role: "assistant",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(assistantMessage.status).toBe(201)
  expect(await assistantMessage.json()).toMatchObject({ message: { role: "assistant", sequence: 2 } })

  const firstMessagePage = await app.request(`http://codeline.test/api/sessions/${sessionId}/messages?limit=1`)
  expect(firstMessagePage.status).toBe(200)
  const firstMessagePageBody = await firstMessagePage.json()
  expect(firstMessagePageBody.messages).toHaveLength(1)
  expect(firstMessagePageBody.messages[0]).toMatchObject({ role: "user", sequence: 1 })
  expect(firstMessagePageBody.nextCursor).toEqual(expect.any(String))

  const secondMessagePage = await app.request(
    `http://codeline.test/api/sessions/${sessionId}/messages?cursor=${encodeURIComponent(firstMessagePageBody.nextCursor)}&limit=1`,
  )
  expect(secondMessagePage.status).toBe(200)
  expect(await secondMessagePage.json()).toMatchObject({
    messages: [{ role: "assistant", sequence: 2 }],
    nextCursor: null,
  })

  const renamed = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    body: JSON.stringify({ title: "Renamed persistence flow" }),
    headers: {
      "Content-Type": "application/json",
      "If-Match": (await app.request(`http://codeline.test/api/sessions/${sessionId}`)).headers.get("ETag") as string,
    },
    method: "PATCH",
  })
  expect(renamed.status).toBe(200)
  expect(await renamed.json()).toMatchObject({ session: { id: sessionId, title: "Renamed persistence flow" } })

  const readBeforeArchive = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  expect(readBeforeArchive.status).toBe(200)
  expect(await readBeforeArchive.json()).toMatchObject({
    session: { id: sessionId, title: "Renamed persistence flow" },
  })

  const listedBeforeArchive = await app.request("http://codeline.test/api/sessions")
  expect(listedBeforeArchive.status).toBe(200)
  expect(await listedBeforeArchive.json()).toMatchObject({ sessions: [{ id: sessionId }] })

  const archivedRead = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  const archived = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, {
    headers: { "If-Match": archivedRead.headers.get("ETag") as string },
    method: "POST",
  })
  expect(archived.status).toBe(200)
  expect(await archived.json()).toMatchObject({ session: { id: sessionId, archivedAt: expect.any(String) } })

  const writeAfterArchive = await app.request(`http://codeline.test/api/sessions/${sessionId}/messages`, {
    body: JSON.stringify({
      clientRequestId: `session-flow-after-archive-${uuidv7()}`,
      content: "This write must be rejected.",
      role: "user",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(writeAfterArchive.status).toBe(409)

  const listedAfterArchive = await app.request("http://codeline.test/api/sessions")
  expect(await listedAfterArchive.json()).toMatchObject({ sessions: [] })
  const listedArchived = await app.request("http://codeline.test/api/sessions?includeArchived=1")
  expect(await listedArchived.json()).toMatchObject({
    sessions: [{ id: sessionId, archivedAt: expect.any(String) }],
  })
  const readArchived = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  expect(readArchived.status).toBe(200)
  expect(await readArchived.json()).toMatchObject({ session: { id: sessionId, archivedAt: expect.any(String) } })

  const readBeforeDelete = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  const deleted = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    headers: { "If-Match": readBeforeDelete.headers.get("ETag") as string },
    method: "DELETE",
  })
  expect(deleted.status).toBe(200)
  expect(await deleted.json()).toMatchObject({ session: { id: sessionId } })

  const missing = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  expect(missing.status).toBe(404)
  const messagesAfterDelete = await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))
  expect(messagesAfterDelete).toEqual([])
})
