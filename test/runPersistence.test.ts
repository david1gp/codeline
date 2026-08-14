import { afterAll, beforeAll, expect, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { developmentUserTable } from "../src/identity/db/developmentUserTable.js"
import { developmentUserUpsert } from "../src/identity/db/developmentUserUpsert.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runLoad } from "../src/run/actions/runLoad.js"
import { runRetryAttemptCreate } from "../src/run/actions/runRetryAttemptCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `run-test-agent-${uuidv7()}`,
  secondaryAgentId: `run-test-secondary-agent-${uuidv7()}`,
  secondaryServerId: `run-test-secondary-server-${uuidv7()}`,
  serverId: `run-test-server-${uuidv7()}`,
  sessionId: `run-test-session-${uuidv7()}`,
  userKey: `run-test-user-${uuidv7()}`,
}
let userId: string | undefined

const input = {
  budget: { maxDurationMs: 10_000 },
  clientRunId: "client-run-1",
  snapshot: {
    configuration: { model: "deterministic-model", provider: "deterministic" as const },
    configurationRevision: "configuration-revision-1",
    target: { agentId: fixture.agentId, serverId: fixture.serverId },
  },
  streamId: "run-stream-1",
}

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentUserUpsert(database, {
    displayName: "Run Test User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(serverTable).values({
    endpoint: "http://run-test-server.test",
    id: fixture.serverId,
    name: "Run Test Server",
    ownerUserId: userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://run-test-secondary-server.test",
    id: fixture.secondaryServerId,
    name: "Run Test Secondary Server",
    ownerUserId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Run Test Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
  await database.insert(agentTable).values({
    id: fixture.secondaryAgentId,
    name: "Run Test Secondary Agent",
    role: "coding",
    serverId: fixture.secondaryServerId,
  })
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: fixture.sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Run Test Session",
    userId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(developmentUserTable).where(eq(developmentUserTable.id, userId))
  await client.end()
})

test.skipIf(!databaseAvailable)(
  "run creation is transactional, idempotent, immutable, and creates only attempt one",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, input)
    expect(created).toMatchObject({
      success: true,
      data: { created: true, attempt: { ordinal: 1, status: "accepted" }, run: { status: "accepted" } },
    })
    if (!created.success) return

    const repeated = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      snapshot: { ...input.snapshot, target: { ...input.snapshot.target } },
    })
    expect(repeated).toMatchObject({ success: true, data: { created: false, run: { id: created.data.run.id } } })

    const conflict = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      streamId: "different-stream",
    })
    expect(conflict).toMatchObject({
      success: false,
      errorMessage: "The client run ID conflicts with different immutable run input.",
    })

    const loaded = await runLoad(database, userId, fixture.sessionId, input.clientRunId)
    expect(loaded).toMatchObject({ success: true, data: { run: { id: created.data.run.id }, attempt: { ordinal: 1 } } })
    expect(await runLoad(database, "development:unknown-run-user", fixture.sessionId, input.clientRunId)).toMatchObject(
      {
        success: false,
        errorMessage: "The run could not be found.",
      },
    )
    expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, created.data.run.id))).toHaveLength(
      1,
    )

    const duplicateStream = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: "client-run-duplicate-stream",
    })
    expect(duplicateStream).toMatchObject({ success: false })
  },
)

test.skipIf(!databaseAvailable)("run creation requires the existing session target", async () => {
  if (userId === undefined) return

  expect(
    await runCreate(database, userId, `run-test-missing-session-${uuidv7()}`, {
      ...input,
      clientRunId: "client-run-missing-session",
    }),
  ).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  expect(
    await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: "client-run-mismatched-target",
      snapshot: { ...input.snapshot, target: { agentId: fixture.agentId, serverId: fixture.secondaryServerId } },
    }),
  ).toMatchObject({
    success: false,
    errorMessage: "The run snapshot target does not match the session target.",
  })

  expect(
    await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: "client-run-cross-target",
      snapshot: {
        ...input.snapshot,
        target: { agentId: fixture.secondaryAgentId, serverId: fixture.secondaryServerId },
      },
    }),
  ).toMatchObject({
    success: false,
    errorMessage: "The run snapshot target does not match the session target.",
  })
})

test.skipIf(!databaseAvailable)(
  "run transitions are legal, lock-safe, and keep the run and attempt consistent",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, { ...input, clientRunId: "client-run-2" })
    if (!created.success) return
    const runId = created.data.run.id

    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "succeeded" })).toMatchObject({
      success: false,
    })
    const running = await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })
    expect(running).toMatchObject({
      success: true,
      data: { changed: true, run: { status: "running" }, attempt: { status: "running" } },
    })

    const failed = await runTransition(database, userId, fixture.sessionId, runId, {
      failure: { code: "provider_failed", message: "The provider failed." },
      status: "failed",
    })
    expect(failed).toMatchObject({
      success: true,
      data: { changed: true, run: { status: "failed" }, attempt: { status: "failed" } },
    })
    const repeated = await runTransition(database, userId, fixture.sessionId, runId, {
      failure: { code: "provider_failed", message: "The provider failed." },
      status: "failed",
    })
    expect(repeated).toMatchObject({ success: true, data: { changed: false } })
    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: false,
    })
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "different", message: "Do not overwrite." },
        status: "failed",
      }),
    ).toMatchObject({ success: false })
  },
)

test.skipIf(!databaseAvailable)(
  "retry attempt creation admits one durable next attempt and is idempotent under concurrency",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxAttempts: 3, maxDurationMs: 10_000 },
      clientRunId: `client-run-retry-${uuidv7()}`,
      streamId: `run-retry-stream-${uuidv7()}`,
    })
    if (!created.success) return

    const runId = created.data.run.id
    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
    })
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "provider_timeout", message: "The provider timed out." },
        status: "failed",
      }),
    ).toMatchObject({ success: true })

    const concurrent = await Promise.all([
      runRetryAttemptCreate(database, userId, fixture.sessionId, runId),
      runRetryAttemptCreate(database, userId, fixture.sessionId, runId),
    ])
    expect(concurrent.map((result) => (result.success ? result.data.created : false)).sort()).toEqual([false, true])

    const admitted = concurrent.find((result) => result.success && result.data.created)
    if (admitted === undefined || !admitted.success) return
    expect(admitted.data).toMatchObject({
      admission: { decision: "retry", nextAttemptOrdinal: 2 },
      attempt: {
        budget: { maxAttempts: 3, maxChildRuns: 0, maxDurationMs: 10_000 },
        ordinal: 2,
        snapshot: created.data.run.snapshot,
        status: "accepted",
      },
      created: true,
      run: { failure: null, status: "accepted", startedAt: null, finishedAt: null },
    })

    const loadedRetry = await runLoad(database, userId, fixture.sessionId, created.data.run.clientRunId)
    expect(loadedRetry).toMatchObject({
      success: true,
      data: { attempt: { id: admitted.data.attempt.id, ordinal: 2 } },
    })
    const attemptsAfterAdmission = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, runId))
      .orderBy(asc(attemptTable.ordinal))
    expect(attemptsAfterAdmission.map((attempt) => attempt.ordinal)).toEqual([1, 2])

    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
      data: { attempt: { ordinal: 2, status: "running" } },
    })
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "provider_timeout", message: "The provider timed out again." },
        status: "failed",
      }),
    ).toMatchObject({ success: true, data: { attempt: { ordinal: 2, status: "failed" } } })

    const third = await runRetryAttemptCreate(database, userId, fixture.sessionId, runId)
    expect(third).toMatchObject({
      success: true,
      data: { admission: { nextAttemptOrdinal: 3 }, attempt: { ordinal: 3, status: "accepted" }, created: true },
    })
    if (!third.success) return
    expect(third.data.attempt.snapshot).toEqual(created.data.run.snapshot)
    expect(third.data.attempt.budget).toEqual(created.data.run.budget)

    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
      data: { attempt: { ordinal: 3, status: "running" } },
    })
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "provider_timeout", message: "The provider timed out a third time." },
        status: "failed",
      }),
    ).toMatchObject({ success: true, data: { attempt: { ordinal: 3, status: "failed" } } })
    expect(await runRetryAttemptCreate(database, userId, fixture.sessionId, runId)).toMatchObject({
      success: false,
      errorMessage: "The run retry was not admitted: attempt_budget_exhausted.",
    })
    expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, runId))).toHaveLength(3)
  },
)

test.skipIf(!databaseAvailable)("accepted runs can abort but cannot be reopened", async () => {
  if (userId === undefined) return
  const created = await runCreate(database, userId, fixture.sessionId, { ...input, clientRunId: "client-run-3" })
  if (!created.success) return
  expect(
    await runTransition(database, userId, fixture.sessionId, created.data.run.id, { status: "aborted" }),
  ).toMatchObject({
    success: true,
    data: { run: { status: "aborted" }, attempt: { status: "aborted" } },
  })
  expect(
    await runTransition(database, userId, fixture.sessionId, created.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: false,
  })
})
