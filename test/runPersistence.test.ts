import { afterAll, beforeAll, expect, test } from "bun:test"
import * as crypto from "node:crypto"
import { createResultError } from "@adaptive-ds/result"
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { runCancel } from "../src/run/actions/runCancel.js"
import { runChildCreate } from "../src/run/actions/runChildCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runDelegationFinalize } from "../src/run/actions/runDelegationFinalize.js"
import { runLoad } from "../src/run/actions/runLoad.js"
import { runRetryAttemptCreate } from "../src/run/actions/runRetryAttemptCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { runRepositoryChildCreate } from "../src/run/db/runRepositoryChildCreate.js"
import { runTable } from "../src/run/db/runTable.js"
import { runErrorCodes } from "../src/run/errors/runErrorCodes.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `run-test-agent-${uuidv7()}`,
  secondaryAgentId: `run-test-secondary-agent-${uuidv7()}`,
  secondaryServerId: `run-test-secondary-server-${uuidv7()}`,
  serverId: `run-test-server-${uuidv7()}`,
  sessionId: `run-test-session-${uuidv7()}`,
  selectedSessionId: `run-test-selected-session-${uuidv7()}`,
  selectedSubagentId: `run-test-selected-subagent-${uuidv7()}`,
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
  streamId: `run-stream-${fixture.sessionId}`,
}

function retryCancellationDatabaseCreate(): {
  database: typeof database
  releaseRetryTransaction: () => void
  retryTransactionStarted: Promise<void>
} {
  let rootTransactionConnectionCount = 0
  let retryTransactionStartedResolve: () => void = () => undefined
  const retryTransactionStarted = new Promise<void>((resolve) => {
    retryTransactionStartedResolve = resolve
  })
  let releaseRetryTransactionResolve: () => void = () => undefined
  const retryTransactionGate = new Promise<void>((resolve) => {
    releaseRetryTransactionResolve = resolve
  })

  const controlledDatabase = new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "rootTransactionConnectionCreate") return Reflect.get(target, property, receiver)
      return () => {
        const connection = target.rootTransactionConnectionCreate?.()
        if (connection === undefined || rootTransactionConnectionCount++ !== 0) return connection
        const transactionCreate = connection.transactionCreate
        if (transactionCreate === undefined) return connection
        connection.transactionCreate = async (mode) => {
          retryTransactionStartedResolve()
          await retryTransactionGate
          return transactionCreate(mode)
        }
        return connection
      }
    },
  })

  return {
    database: controlledDatabase,
    releaseRetryTransaction: releaseRetryTransactionResolve,
    retryTransactionStarted,
  }
}

function terminalPersistenceRaceDatabaseCreate(): {
  database: typeof database
  releaseFirstTransaction: () => void
  firstTransactionStarted: Promise<void>
} {
  let rootTransactionConnectionCount = 0
  let firstTransactionStartedResolve: () => void = () => undefined
  const firstTransactionStarted = new Promise<void>((resolve) => {
    firstTransactionStartedResolve = resolve
  })
  let releaseFirstTransactionResolve: () => void = () => undefined
  const firstTransactionGate = new Promise<void>((resolve) => {
    releaseFirstTransactionResolve = resolve
  })

  const controlledDatabase = new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "rootTransactionConnectionCreate") return Reflect.get(target, property, receiver)
      return () => {
        const connection = target.rootTransactionConnectionCreate?.()
        if (connection === undefined || rootTransactionConnectionCount++ !== 0) return connection
        const transactionCreate = connection.transactionCreate
        if (transactionCreate === undefined) return connection
        connection.transactionCreate = async (mode) => {
          const transaction = await transactionCreate(mode)
          firstTransactionStartedResolve()
          await firstTransactionGate
          return transaction
        }
        return connection
      }
    },
  })

  return {
    database: controlledDatabase,
    firstTransactionStarted,
    releaseFirstTransaction: releaseFirstTransactionResolve,
  }
}

function childAdmissionRaceDatabaseCreate(): {
  admissionGate: Promise<void>
  admissionObserved: Promise<void>
  database: typeof database
  markAdmissionObserved: () => void
  releaseAdmission: () => void
} {
  let admissionObservedResolve: () => void = () => undefined
  const admissionObserved = new Promise<void>((resolve) => {
    admissionObservedResolve = resolve
  })
  let releaseAdmissionResolve: () => void = () => undefined
  const admissionGate = new Promise<void>((resolve) => {
    releaseAdmissionResolve = resolve
  })

  const controlledDatabase = new Proxy(database, {
    get(target, property, receiver) {
      if (property === "rootTransactionConnectionCreate" || property === "transaction") return undefined
      return Reflect.get(target, property, receiver)
    },
  })

  return {
    admissionGate,
    admissionObserved,
    database: controlledDatabase,
    markAdmissionObserved: admissionObservedResolve,
    releaseAdmission: releaseAdmissionResolve,
  }
}

const selectedInstructionContent = "The selected session instructions are immutable."
const selectedInstructionSnapshot = {
  snapshots: [
    {
      canonicalPath: "/tmp/codeline-run-persistence/AGENTS.md",
      content: selectedInstructionContent,
      digest: `sha256-${crypto.createHash("sha256").update(selectedInstructionContent, "utf8").digest("hex")}`,
      precedence: 1,
      scope: ".",
      size: Buffer.byteLength(selectedInstructionContent, "utf8"),
      source: "project" as const,
    },
  ],
  version: 1 as const,
}

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Run Test User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(organizationTable).values({ id: userId, externalId: userId, name: "Run Test Organization" })
  await database.insert(serverTable).values({
    endpoint: "http://run-test-server.test",
    id: fixture.serverId,
    name: "Run Test Server",
    organizationId: userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://run-test-secondary-server.test",
    id: fixture.secondaryServerId,
    name: "Run Test Secondary Server",
    organizationId: userId,
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
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    executionSelection: {
      tools: {
        primary: { agentId: fixture.agentId, tools: { bash: true, webfetch: false } },
        selectableSubagents: [{ agentId: fixture.selectedSubagentId, tools: { bash: false, webfetch: true } }],
      },
      version: 1 as const,
    },
    id: fixture.selectedSessionId,
    instructionSnapshot: selectedInstructionSnapshot,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Run Test Selected Session",
    userId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
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
    expect(created.data.run.deadlineAt).toBeInstanceOf(Date)
    expect(created.data.run.deadlineAt.getTime()).toBeGreaterThan(created.data.run.createdAt.getTime())

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
      code: runErrorCodes.clientRunIdConflict,
      success: false,
      errorMessage: "The client run ID conflicts with different immutable run input.",
    })

    const loaded = await runLoad(database, userId, fixture.sessionId, input.clientRunId)
    expect(loaded).toMatchObject({ success: true, data: { run: { id: created.data.run.id }, attempt: { ordinal: 1 } } })
    expect(await runLoad(database, "development:unknown-run-user", fixture.sessionId, input.clientRunId)).toMatchObject(
      {
        code: runErrorCodes.notFound,
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

test.skipIf(!databaseAvailable)(
  "run persistence carries the selected manifest through attempts, retries, and delegated children",
  async () => {
    if (userId === undefined) return
    const selectionManifest = {
      commandCatalog: { digest: null, version: 1 as const },
      instructions: selectedInstructionSnapshot,
      skills: {
        descriptionCatalog: {
          characterCount: 0,
          content: "",
          estimatedTokens: 0,
          estimatedTokensIsEstimate: true as const,
          skills: [],
          version: 1 as const,
        },
        presetName: "default",
        snapshots: [],
        version: 1 as const,
      },
      tools: {
        primary: {
          agentId: fixture.agentId,
          tools: ["bash", "skill", "delegate_task"] as Array<"bash" | "webfetch" | "skill" | "delegate_task">,
        },
        selectableSubagents: [
          {
            agentId: fixture.selectedSubagentId,
            tools: ["webfetch", "skill", "delegate_task"] as Array<"bash" | "webfetch" | "skill" | "delegate_task">,
          },
        ],
      },
      version: 1 as const,
    }
    const rootInput = {
      budget: { maxAttempts: 2, maxChildDepth: 2, maxChildRuns: 3, maxDurationMs: 10_000 },
      clientRunId: `client-run-selected-${uuidv7()}`,
      snapshot: {
        ...input.snapshot,
        configuration: { ...input.snapshot.configuration, tools: { bash: true, webfetch: false } },
        executionManifest: selectionManifest,
      },
      streamId: `run-selected-${uuidv7()}`,
    }
    const root = await runCreate(database, userId, fixture.selectedSessionId, rootInput)
    expect(root).toMatchObject({ success: true, data: { created: true, attempt: { ordinal: 1 } } })
    if (!root.success) return
    expect(root.data.attempt.snapshot.executionManifest).toEqual(root.data.run.snapshot.executionManifest)

    expect(
      await runTransition(database, userId, fixture.selectedSessionId, root.data.run.id, { status: "running" }),
    ).toMatchObject({ success: true })
    expect(
      await runTransition(database, userId, fixture.selectedSessionId, root.data.run.id, {
        failure: { code: "provider_timeout", message: "The selected run timed out." },
        status: "failed",
      }),
    ).toMatchObject({ success: true })
    const retry = await runRetryAttemptCreate(database, userId, fixture.selectedSessionId, root.data.run.id, {
      now: () => new Date(root.data.run.deadlineAt.getTime() - 1),
    })
    expect(retry).toMatchObject({ success: true, data: { attempt: { ordinal: 2 } } })
    if (!retry.success) return
    expect(retry.data.attempt.snapshot.executionManifest).toEqual(root.data.run.snapshot.executionManifest)

    expect(
      await runTransition(database, userId, fixture.selectedSessionId, root.data.run.id, { status: "running" }),
    ).toMatchObject({ success: true })
    const inherited = await runChildCreate(database, userId, fixture.selectedSessionId, {
      delegationKey: `selected-inherited-${uuidv7()}`,
      parentAttemptId: retry.data.attempt.id,
      parentRunId: root.data.run.id,
      task: "Preserve the parent execution manifest.",
    })
    expect(inherited).toMatchObject({ success: true, data: { created: true } })
    if (!inherited.success) return
    expect(inherited.data.run.snapshot.executionManifest).toEqual(root.data.run.snapshot.executionManifest)
    expect(inherited.data.attempt.snapshot.executionManifest).toEqual(root.data.run.snapshot.executionManifest)

    const explicitManifest = {
      ...selectionManifest,
      tools: {
        primary: selectionManifest.tools.selectableSubagents[0] as NonNullable<
          (typeof selectionManifest.tools.selectableSubagents)[number]
        >,
        selectableSubagents: [],
      },
    }
    const explicitDelegationKey = `selected-explicit-${uuidv7()}`
    const explicit = await runChildCreate(database, userId, fixture.selectedSessionId, {
      delegationKey: explicitDelegationKey,
      parentAttemptId: retry.data.attempt.id,
      parentRunId: root.data.run.id,
      snapshot: {
        ...root.data.run.snapshot,
        configuration: { ...root.data.run.snapshot.configuration, tools: { bash: false, webfetch: true } },
        executionManifest: explicitManifest,
        target: { agentId: fixture.selectedSubagentId, serverId: fixture.serverId },
      },
      task: "Use only the persisted selectable-subagent tools.",
    })
    expect(explicit).toMatchObject({ success: true, data: { created: true } })
    if (!explicit.success) return
    expect(explicit.data.run.snapshot.executionManifest).toEqual(explicitManifest)

    const changedInstructionContent = "The child must not replace the parent instruction snapshot."
    const changedInstructionSnapshot = {
      ...selectedInstructionSnapshot,
      snapshots: selectedInstructionSnapshot.snapshots.map((snapshot) => ({
        ...snapshot,
        content: changedInstructionContent,
        digest: `sha256-${crypto.createHash("sha256").update(changedInstructionContent, "utf8").digest("hex")}`,
        size: Buffer.byteLength(changedInstructionContent, "utf8"),
      })),
    }
    const changedInstructions = await runChildCreate(database, userId, fixture.selectedSessionId, {
      delegationKey: `selected-changed-instructions-${uuidv7()}`,
      parentAttemptId: retry.data.attempt.id,
      parentRunId: root.data.run.id,
      snapshot: {
        ...root.data.run.snapshot,
        configuration: { ...root.data.run.snapshot.configuration, tools: { bash: false, webfetch: true } },
        executionManifest: { ...explicitManifest, instructions: changedInstructionSnapshot },
        target: { agentId: fixture.selectedSubagentId, serverId: fixture.serverId },
      },
      task: "Attempt to replace the immutable parent instruction snapshot.",
    })
    expect(changedInstructions).toMatchObject({
      code: runErrorCodes.childSnapshotInvalid,
      success: false,
    })

    const persistedDowngrade = structuredClone(explicit.data.run.snapshot)
    delete persistedDowngrade.executionManifest
    await database.update(runTable).set({ snapshot: persistedDowngrade }).where(eq(runTable.id, explicit.data.run.id))
    await database
      .update(attemptTable)
      .set({ snapshot: persistedDowngrade })
      .where(eq(attemptTable.runId, explicit.data.run.id))
    const reusedDowngraded = await runChildCreate(database, userId, fixture.selectedSessionId, {
      delegationKey: explicitDelegationKey,
      parentAttemptId: retry.data.attempt.id,
      parentRunId: root.data.run.id,
      task: "Use only the persisted selectable-subagent tools.",
    })
    expect(reusedDowngraded).toMatchObject({ code: runErrorCodes.childToolEscalation, success: false })

    const escalated = await runChildCreate(database, userId, fixture.selectedSessionId, {
      delegationKey: `selected-escalated-${uuidv7()}`,
      parentAttemptId: retry.data.attempt.id,
      parentRunId: root.data.run.id,
      snapshot: {
        ...root.data.run.snapshot,
        configuration: { ...root.data.run.snapshot.configuration, tools: { bash: true, webfetch: true } },
        executionManifest: {
          ...explicitManifest,
          tools: {
            ...explicitManifest.tools,
            primary: {
              ...explicitManifest.tools.primary,
              tools: ["bash", "webfetch", "skill", "delegate_task"] as Array<
                "bash" | "webfetch" | "skill" | "delegate_task"
              >,
            },
          },
        },
        target: { agentId: fixture.selectedSubagentId, serverId: fixture.serverId },
      },
      task: "Attempt to escalate the selected child tools.",
    })
    expect(escalated).toMatchObject({ code: runErrorCodes.childToolEscalation, success: false })

    const missingManifest = structuredClone(root.data.run.snapshot)
    delete missingManifest.executionManifest
    const downgraded = await runChildCreate(database, userId, fixture.selectedSessionId, {
      delegationKey: `selected-missing-manifest-${uuidv7()}`,
      parentAttemptId: retry.data.attempt.id,
      parentRunId: root.data.run.id,
      snapshot: {
        ...missingManifest,
        configuration: { ...missingManifest.configuration, tools: { bash: false, webfetch: true } },
        target: { agentId: fixture.selectedSubagentId, serverId: fixture.serverId },
      },
      task: "Attempt to omit the manifest from a selected child.",
    })
    expect(downgraded).toMatchObject({ code: runErrorCodes.childToolEscalation, success: false })
  },
)

test.skipIf(!databaseAvailable)(
  "legacy pre-manifest snapshots remain compatible through roots, retries, and children",
  async () => {
    if (userId === undefined) return
    const legacyRoot = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxAttempts: 2, maxChildDepth: 1, maxChildRuns: 3, maxDurationMs: 10_000 },
      clientRunId: `client-run-legacy-${uuidv7()}`,
      streamId: `run-legacy-${uuidv7()}`,
    })
    expect(legacyRoot).toMatchObject({ success: true, data: { created: true, attempt: { ordinal: 1 } } })
    if (!legacyRoot.success) return
    expect(legacyRoot.data.run.snapshot).not.toHaveProperty("executionManifest")
    expect(legacyRoot.data.attempt.snapshot).toEqual(legacyRoot.data.run.snapshot)

    expect(
      await runTransition(database, userId, fixture.sessionId, legacyRoot.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })
    expect(
      await runTransition(database, userId, fixture.sessionId, legacyRoot.data.run.id, {
        failure: { code: "provider_timeout", message: "The legacy run timed out." },
        status: "failed",
      }),
    ).toMatchObject({ success: true })
    const retry = await runRetryAttemptCreate(database, userId, fixture.sessionId, legacyRoot.data.run.id, {
      now: () => new Date(legacyRoot.data.run.deadlineAt.getTime() - 1),
    })
    expect(retry).toMatchObject({ success: true, data: { attempt: { ordinal: 2 } } })
    if (!retry.success) return
    expect(retry.data.attempt.snapshot).toEqual(legacyRoot.data.run.snapshot)
    expect(retry.data.attempt.snapshot).not.toHaveProperty("executionManifest")

    expect(
      await runTransition(database, userId, fixture.sessionId, legacyRoot.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })
    const inherited = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: `legacy-inherited-${uuidv7()}`,
      parentAttemptId: retry.data.attempt.id,
      parentRunId: legacyRoot.data.run.id,
      task: "Inherit the pre-manifest parent snapshot.",
    })
    expect(inherited).toMatchObject({ success: true, data: { created: true } })
    if (!inherited.success) return
    expect(inherited.data.run.snapshot).toEqual(legacyRoot.data.run.snapshot)
    expect(inherited.data.attempt.snapshot).toEqual(legacyRoot.data.run.snapshot)

    const explicit = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: `legacy-explicit-${uuidv7()}`,
      parentAttemptId: retry.data.attempt.id,
      parentRunId: legacyRoot.data.run.id,
      snapshot: structuredClone(legacyRoot.data.run.snapshot),
      task: "Use an explicit pre-manifest child snapshot.",
    })
    expect(explicit).toMatchObject({ success: true, data: { created: true } })
    if (!explicit.success) return
    expect(explicit.data.run.snapshot).toEqual(legacyRoot.data.run.snapshot)
    expect(explicit.data.attempt.snapshot).toEqual(legacyRoot.data.run.snapshot)
  },
)

test.skipIf(!databaseAvailable)("run creation requires the existing session target", async () => {
  if (userId === undefined) return

  expect(
    await runCreate(database, userId, `run-test-missing-session-${uuidv7()}`, {
      ...input,
      clientRunId: "client-run-missing-session",
    }),
  ).toMatchObject({
    code: runErrorCodes.sessionNotFound,
    success: false,
    errorMessage: "The session could not be found.",
  })

  expect(
    await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: "client-run-mismatched-target",
      snapshot: { ...input.snapshot, target: { agentId: fixture.agentId, serverId: fixture.secondaryServerId } },
    }),
  ).toMatchObject({
    code: runErrorCodes.snapshotTargetMismatch,
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
    code: runErrorCodes.snapshotTargetMismatch,
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
    expect(admitted.data.run.deadlineAt).toEqual(created.data.run.deadlineAt)

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
      code: runErrorCodes.retryNotAdmitted,
      success: false,
      errorMessage: "The run retry was not admitted: attempt_budget_exhausted.",
    })
    expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, runId))).toHaveLength(3)
  },
)

test.skipIf(!databaseAvailable)("retry attempt insertion rolls back without a phantom continuation", async () => {
  if (userId === undefined) return
  const created = await runCreate(database, userId, fixture.sessionId, {
    ...input,
    budget: { maxAttempts: 3, maxDurationMs: 10_000 },
    clientRunId: `client-run-retry-insert-failure-${uuidv7()}`,
    streamId: `run-retry-insert-failure-${uuidv7()}`,
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

  const retry = await runRetryAttemptCreate(database, userId, fixture.sessionId, runId, {
    attemptCreate: async (transaction, values) => {
      const [attempt] = await transaction.insert(attemptTable).values(values).returning()
      expect(attempt).toBeDefined()
      return createResultError("failureInjection", "retry attempt insertion failed after the insert")
    },
    now: () => new Date(created.data.run.deadlineAt.getTime() - 1),
  })
  expect(retry).toMatchObject({
    errorMessage: "retry attempt insertion failed after the insert",
    success: false,
  })
  expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, runId))).toHaveLength(1)
  const [runAfterFailure] = await database.select().from(runTable).where(eq(runTable.id, runId))
  expect(runAfterFailure).toMatchObject({ failure: { code: "provider_timeout" }, status: "failed" })
})

test.skipIf(!databaseAvailable)("retry reopen rolls back the inserted attempt", async () => {
  if (userId === undefined) return
  const created = await runCreate(database, userId, fixture.sessionId, {
    ...input,
    budget: { maxAttempts: 3, maxDurationMs: 10_000 },
    clientRunId: `client-run-retry-reopen-failure-${uuidv7()}`,
    streamId: `run-retry-reopen-failure-${uuidv7()}`,
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

  const retry = await runRetryAttemptCreate(database, userId, fixture.sessionId, runId, {
    now: () => new Date(created.data.run.deadlineAt.getTime() - 1),
    runReopen: async (transaction, values) => {
      await transaction
        .update(runTable)
        .set({ failure: null, finishedAt: null, startedAt: null, status: "accepted", updatedAt: values.now })
        .where(and(eq(runTable.id, values.runId), eq(runTable.status, "failed")))
      return createResultError("failureInjection", "retry reopen failed after the update")
    },
  })
  expect(retry).toMatchObject({
    errorMessage: "retry reopen failed after the update",
    success: false,
  })
  expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, runId))).toHaveLength(1)
  const [runAfterFailure] = await database.select().from(runTable).where(eq(runTable.id, runId))
  expect(runAfterFailure).toMatchObject({ failure: { code: "provider_timeout" }, status: "failed" })
})

test.skipIf(!databaseAvailable)("target cancellation persistence rolls back its fields", async () => {
  if (userId === undefined) return
  const created = await runCreate(database, userId, fixture.sessionId, {
    ...input,
    clientRunId: `client-run-cancel-target-failure-${uuidv7()}`,
    streamId: `run-cancel-target-failure-${uuidv7()}`,
  })
  if (!created.success) return
  const runId = created.data.run.id
  expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
    success: true,
  })
  const cancellationTime = new Date("2026-08-27T00:00:00.000Z")
  const cancellation = await runCancel(
    database,
    userId,
    fixture.sessionId,
    runId,
    {},
    {
      now: () => cancellationTime,
      targetCancellationUpdate: async (transaction, values) => {
        await transaction
          .update(runTable)
          .set({
            cancellationKind: "requested",
            cancellationRequestedAt: values.now,
            cancellationSourceRunId: null,
            updatedAt: values.now,
          })
          .where(
            and(
              eq(runTable.id, values.id),
              eq(runTable.status, values.status),
              isNull(runTable.cancellationRequestedAt),
            ),
          )
        return createResultError("failureInjection", "target cancellation persistence failed after the update")
      },
    },
  )
  expect(cancellation).toMatchObject({
    errorMessage: "target cancellation persistence failed after the update",
    success: false,
  })
  const [runAfterFailure] = await database.select().from(runTable).where(eq(runTable.id, runId))
  expect(runAfterFailure).toMatchObject({
    cancellationKind: null,
    cancellationRequestedAt: null,
    cancellationSourceRunId: null,
    status: "running",
  })
})

test.skipIf(!databaseAvailable)("descendant cancellation persistence rolls back target and descendants", async () => {
  if (userId === undefined) return
  const parent = await runCreate(database, userId, fixture.sessionId, {
    ...input,
    budget: { maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 10_000 },
    clientRunId: `client-run-cancel-descendant-failure-${uuidv7()}`,
    streamId: `run-cancel-descendant-failure-parent-${uuidv7()}`,
  })
  if (!parent.success) return
  expect(
    await runTransition(database, userId, fixture.sessionId, parent.data.run.id, { status: "running" }),
  ).toMatchObject({ success: true })
  const child = await runChildCreate(database, userId, fixture.sessionId, {
    delegationKey: `cancel-descendant-failure-${uuidv7()}`,
    parentAttemptId: parent.data.attempt.id,
    parentRunId: parent.data.run.id,
    task: "The descendant cancellation persistence must roll back.",
  })
  if (!child.success) return
  const cancellation = await runCancel(
    database,
    userId,
    fixture.sessionId,
    parent.data.run.id,
    {},
    {
      descendantCancellationUpdate: async (transaction, values) => {
        await transaction
          .update(runTable)
          .set({
            cancellationKind: "ancestor",
            cancellationRequestedAt: values.requestedAt,
            cancellationSourceRunId: values.sourceRunId,
            updatedAt: values.now,
          })
          .where(
            and(
              eq(runTable.userId, values.userId),
              eq(runTable.sessionId, values.sessionId),
              inArray(runTable.id, values.runIds),
              inArray(runTable.status, ["accepted", "running"]),
              isNull(runTable.cancellationRequestedAt),
            ),
          )
        return createResultError("failureInjection", "descendant cancellation persistence failed after the update")
      },
      now: () => new Date("2026-08-27T00:00:00.000Z"),
    },
  )
  expect(cancellation).toMatchObject({
    errorMessage: "descendant cancellation persistence failed after the update",
    success: false,
  })
  const [parentAfterFailure, childAfterFailure] = await Promise.all(
    [parent.data.run.id, child.data.run.id].map(async (runId) => {
      const [run] = await database.select().from(runTable).where(eq(runTable.id, runId))
      return run
    }),
  )
  expect(parentAfterFailure).toMatchObject({
    cancellationKind: null,
    cancellationRequestedAt: null,
    cancellationSourceRunId: null,
    status: "running",
  })
  expect(childAfterFailure).toMatchObject({
    cancellationKind: null,
    cancellationRequestedAt: null,
    cancellationSourceRunId: null,
    status: "accepted",
  })
})

test.skipIf(!databaseAvailable)("retry attempt creation rejects durable cancellation intent", async () => {
  if (userId === undefined) return
  const created = await runCreate(database, userId, fixture.sessionId, {
    ...input,
    budget: { maxAttempts: 3, maxDurationMs: 10_000 },
    clientRunId: `client-run-retry-cancelled-${uuidv7()}`,
    streamId: `run-retry-cancelled-${uuidv7()}`,
  })
  if (!created.success) return
  expect(
    await runTransition(database, userId, fixture.sessionId, created.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  expect(
    await runTransition(database, userId, fixture.sessionId, created.data.run.id, {
      failure: { code: "provider_timeout", message: "The provider timed out." },
      status: "failed",
    }),
  ).toMatchObject({ success: true })
  expect(await runCancel(database, userId, fixture.sessionId, created.data.run.id)).toMatchObject({
    success: true,
    data: { changed: true },
  })

  expect(
    await runRetryAttemptCreate(database, userId, fixture.sessionId, created.data.run.id, {
      now: () => new Date(created.data.run.deadlineAt.getTime() - 1),
    }),
  ).toMatchObject({
    code: runErrorCodes.retryNotAdmitted,
    success: false,
    errorMessage: "The run retry was not admitted: cancelled.",
  })
  expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, created.data.run.id))).toHaveLength(1)
})

test.skipIf(!databaseAvailable)(
  "retry admission and cancellation have one deterministic winner after an attempt failure",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxAttempts: 3, maxDurationMs: 10_000 },
      clientRunId: `client-run-retry-cancellation-race-${uuidv7()}`,
      streamId: `run-retry-cancellation-race-${uuidv7()}`,
    })
    if (!created.success) return
    const runId = created.data.run.id
    const retryNow = () => new Date(created.data.run.deadlineAt.getTime() - 1)

    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
    })
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "provider_timeout", message: "The provider timed out." },
        status: "failed",
      }),
    ).toMatchObject({ success: true })

    const race = retryCancellationDatabaseCreate()
    const retryPromise = runRetryAttemptCreate(race.database, userId, fixture.sessionId, runId, { now: retryNow })
    await race.retryTransactionStarted
    const cancellationPromise = runCancel(race.database, userId, fixture.sessionId, runId)
    const cancellation = await cancellationPromise
    race.releaseRetryTransaction()
    const retry = await retryPromise

    expect(cancellation).toMatchObject({
      success: true,
      data: {
        cancelledRunIds: [runId],
        changed: true,
        descendantsCancelled: 0,
        run: { cancellationKind: "requested", status: "failed" },
      },
    })
    expect(retry).toMatchObject({
      code: runErrorCodes.retryNotAdmitted,
      errorMessage: "The run retry was not admitted: cancelled.",
      success: false,
    })

    const attemptsAfterRace = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, runId))
      .orderBy(asc(attemptTable.ordinal))
    expect(attemptsAfterRace.map((attempt) => attempt.ordinal)).toEqual([1])
    const [runAfterRace] = await database.select().from(runTable).where(eq(runTable.id, runId))
    expect(runAfterRace).toMatchObject({ cancellationKind: "requested", status: "failed" })
    expect(runAfterRace?.cancellationRequestedAt).toBeInstanceOf(Date)

    expect(await runRetryAttemptCreate(database, userId, fixture.sessionId, runId, { now: retryNow })).toMatchObject({
      code: runErrorCodes.retryNotAdmitted,
      errorMessage: "The run retry was not admitted: cancelled.",
      success: false,
    })
    expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, runId))).toHaveLength(1)
  },
)

test.skipIf(!databaseAvailable)(
  "retry admission commits before cancellation and leaves one active continuation",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxAttempts: 3, maxDurationMs: 10_000 },
      clientRunId: `client-run-retry-before-cancellation-${uuidv7()}`,
      streamId: `run-retry-before-cancellation-${uuidv7()}`,
    })
    if (!created.success) return
    const runId = created.data.run.id
    const retryNow = () => new Date(created.data.run.deadlineAt.getTime() - 1)

    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
    })
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "provider_timeout", message: "The provider timed out." },
        status: "failed",
      }),
    ).toMatchObject({ success: true })

    // Awaiting retry admission establishes that its transaction committed before cancellation starts.
    const retry = await runRetryAttemptCreate(database, userId, fixture.sessionId, runId, { now: retryNow })
    expect(retry).toMatchObject({
      data: {
        admission: { decision: "retry", nextAttemptOrdinal: 2 },
        attempt: { ordinal: 2, status: "accepted" },
        created: true,
        run: { failure: null, status: "accepted" },
      },
      success: true,
    })
    if (!retry.success) return

    const cancellation = await runCancel(database, userId, fixture.sessionId, runId)
    expect(cancellation).toMatchObject({
      data: {
        cancelledRunIds: [runId],
        changed: true,
        descendantsCancelled: 0,
        run: { cancellationKind: "requested", status: "accepted" },
      },
      success: true,
    })

    const attemptsAfterRace = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, runId))
      .orderBy(asc(attemptTable.ordinal))
    const activeAttempts = attemptsAfterRace.filter(
      (attempt) => attempt.status === "accepted" || attempt.status === "running",
    )
    expect(attemptsAfterRace.map((attempt) => attempt.ordinal)).toEqual([1, 2])
    expect(activeAttempts).toHaveLength(1)
    expect(activeAttempts[0]).toMatchObject({ failure: null, finishedAt: null, ordinal: 2, status: "accepted" })

    const [runAfterRace] = await database.select().from(runTable).where(eq(runTable.id, runId))
    const latestAttempt = attemptsAfterRace.at(-1)
    expect(runAfterRace).toMatchObject({
      cancellationKind: "requested",
      failure: null,
      finishedAt: null,
      status: "accepted",
    })
    expect(runAfterRace?.cancellationRequestedAt).toBeInstanceOf(Date)
    expect(latestAttempt).toMatchObject({ failure: null, finishedAt: null, status: "accepted" })
    expect(runAfterRace?.status).toBe(latestAttempt?.status)
    expect(runAfterRace?.failure).toEqual(latestAttempt?.failure)
    expect(runAfterRace?.status).not.toBe("succeeded")
    expect(latestAttempt?.status).not.toBe("succeeded")

    expect(await runRetryAttemptCreate(database, userId, fixture.sessionId, runId, { now: retryNow })).toMatchObject({
      code: runErrorCodes.retryNotAdmitted,
      errorMessage: "The run retry was not admitted: cancelled.",
      success: false,
    })
    expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, runId))).toHaveLength(2)
  },
)

test.skipIf(!databaseAvailable)(
  "cancellation wins a succeeded terminal persistence race without leaking completion metadata",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: `client-run-cancellation-succeeded-race-${uuidv7()}`,
      streamId: `run-cancellation-succeeded-race-${uuidv7()}`,
    })
    if (!created.success) return
    const runId = created.data.run.id
    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
    })

    const race = terminalPersistenceRaceDatabaseCreate()
    const cancellationPromise = runCancel(race.database, userId, fixture.sessionId, runId)
    await race.firstTransactionStarted
    const succeededPromise = runTransition(race.database, userId, fixture.sessionId, runId, { status: "succeeded" })
    race.releaseFirstTransaction()
    const [cancellation, succeeded] = await Promise.all([cancellationPromise, succeededPromise])

    expect(cancellation).toMatchObject({
      data: {
        cancelledRunIds: [runId],
        changed: true,
        descendantsCancelled: 0,
        run: { cancellationKind: "requested", status: "running" },
      },
      success: true,
    })
    expect(succeeded).toMatchObject({
      code: runErrorCodes.transitionInvalid,
      errorMessage: "The cancelled run cannot be transitioned.",
      success: false,
    })

    const [runAfterRace] = await database.select().from(runTable).where(eq(runTable.id, runId))
    const [attemptAfterRace] = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, runId))
      .orderBy(desc(attemptTable.ordinal))
    expect(runAfterRace).toMatchObject({
      cancellationKind: "requested",
      failure: null,
      finishedAt: null,
      status: "running",
    })
    expect(attemptAfterRace).toMatchObject({ failure: null, finishedAt: null, status: "running" })
    expect(runAfterRace?.cancellationRequestedAt).toBeInstanceOf(Date)
    expect(runAfterRace?.status).toBe(attemptAfterRace?.status)

    const aborted = await runTransition(database, userId, fixture.sessionId, runId, {
      failure: { code: "run_cancelled", message: "The run was cancelled." },
      status: "aborted",
    })
    expect(aborted).toMatchObject({
      data: {
        attempt: { failure: { code: "run_cancelled" }, status: "aborted" },
        changed: true,
        run: { cancellationKind: "requested", failure: { code: "run_cancelled" }, status: "aborted" },
      },
      success: true,
    })
    if (!aborted.success) return
    expect(aborted.data.run.finishedAt).toBeInstanceOf(Date)
    expect(aborted.data.attempt.finishedAt).toEqual(aborted.data.run.finishedAt)
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "run_cancelled", message: "The run was cancelled." },
        status: "aborted",
      }),
    ).toMatchObject({ data: { changed: false }, success: true })
    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "succeeded" })).toMatchObject({
      success: false,
    })
  },
)

test.skipIf(!databaseAvailable)(
  "cancellation wins a failed terminal persistence race without leaking provider failure metadata",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: `client-run-cancellation-failed-race-${uuidv7()}`,
      streamId: `run-cancellation-failed-race-${uuidv7()}`,
    })
    if (!created.success) return
    const runId = created.data.run.id
    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
    })
    const failure = { code: "provider_failed", message: "The provider failed after cancellation." }

    const race = terminalPersistenceRaceDatabaseCreate()
    const cancellationPromise = runCancel(race.database, userId, fixture.sessionId, runId)
    await race.firstTransactionStarted
    const failedPromise = runTransition(race.database, userId, fixture.sessionId, runId, {
      failure,
      status: "failed",
    })
    race.releaseFirstTransaction()
    const [cancellation, failed] = await Promise.all([cancellationPromise, failedPromise])

    expect(cancellation).toMatchObject({
      data: {
        cancelledRunIds: [runId],
        changed: true,
        descendantsCancelled: 0,
        run: { cancellationKind: "requested", status: "running" },
      },
      success: true,
    })
    expect(failed).toMatchObject({
      code: runErrorCodes.transitionInvalid,
      errorMessage: "The cancelled run cannot be transitioned.",
      success: false,
    })

    const [runAfterRace] = await database.select().from(runTable).where(eq(runTable.id, runId))
    const [attemptAfterRace] = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, runId))
      .orderBy(desc(attemptTable.ordinal))
    expect(runAfterRace).toMatchObject({
      cancellationKind: "requested",
      failure: null,
      finishedAt: null,
      status: "running",
    })
    expect(attemptAfterRace).toMatchObject({ failure: null, finishedAt: null, status: "running" })
    expect(runAfterRace?.cancellationRequestedAt).toBeInstanceOf(Date)
    expect(runAfterRace?.status).toBe(attemptAfterRace?.status)
    expect(JSON.stringify(runAfterRace)).not.toContain(failure.message)
    expect(JSON.stringify(attemptAfterRace)).not.toContain(failure.message)

    const abortedFailure = { code: "run_cancelled", message: "The run was cancelled." }
    const aborted = await runTransition(database, userId, fixture.sessionId, runId, {
      failure: abortedFailure,
      status: "aborted",
    })
    expect(aborted).toMatchObject({
      data: {
        attempt: { failure: abortedFailure, status: "aborted" },
        changed: true,
        run: { cancellationKind: "requested", failure: abortedFailure, status: "aborted" },
      },
      success: true,
    })
    if (!aborted.success) return
    expect(aborted.data.run.finishedAt).toBeInstanceOf(Date)
    expect(aborted.data.attempt.finishedAt).toEqual(aborted.data.run.finishedAt)
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "different", message: "The terminal failure cannot be overwritten." },
        status: "aborted",
      }),
    ).toMatchObject({ code: runErrorCodes.failureMetadataImmutable, success: false })
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, { status: "failed", failure }),
    ).toMatchObject({
      success: false,
    })
  },
)

test.skipIf(!databaseAvailable)(
  "succeeded terminal persistence wins a cancellation race without cancellation mutation",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: `client-run-succeeded-before-cancellation-${uuidv7()}`,
      streamId: `run-succeeded-before-cancellation-${uuidv7()}`,
    })
    if (!created.success) return
    const runId = created.data.run.id
    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
    })

    const race = terminalPersistenceRaceDatabaseCreate()
    const succeededPromise = runTransition(race.database, userId, fixture.sessionId, runId, { status: "succeeded" })
    await race.firstTransactionStarted
    const cancellationPromise = runCancel(race.database, userId, fixture.sessionId, runId)
    race.releaseFirstTransaction()
    const [succeeded, cancellation] = await Promise.all([succeededPromise, cancellationPromise])

    expect(succeeded).toMatchObject({
      data: {
        attempt: {
          failure: null,
          status: "succeeded",
        },
        changed: true,
        run: {
          cancellationKind: null,
          cancellationRequestedAt: null,
          cancellationSourceRunId: null,
          failure: null,
          status: "succeeded",
        },
      },
      success: true,
    })
    expect(cancellation).toMatchObject({
      data: {
        cancelledRunIds: [],
        changed: false,
        descendantsCancelled: 0,
        run: {
          cancellationKind: null,
          cancellationRequestedAt: null,
          cancellationSourceRunId: null,
          failure: null,
          status: "succeeded",
        },
      },
      success: true,
    })
    if (!succeeded.success) return
    expect(succeeded.data.run.finishedAt).toBeInstanceOf(Date)
    expect(succeeded.data.attempt.finishedAt).toEqual(succeeded.data.run.finishedAt)

    const [runAfterRace] = await database.select().from(runTable).where(eq(runTable.id, runId))
    const [attemptAfterRace] = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, runId))
      .orderBy(desc(attemptTable.ordinal))
    expect(runAfterRace).toMatchObject({
      cancellationKind: null,
      cancellationRequestedAt: null,
      cancellationSourceRunId: null,
      failure: null,
      status: "succeeded",
    })
    expect(attemptAfterRace).toMatchObject({ failure: null, status: "succeeded" })
    expect(runAfterRace?.finishedAt).toBeInstanceOf(Date)
    expect(attemptAfterRace?.finishedAt).toEqual(runAfterRace?.finishedAt)
    expect(runAfterRace?.status).toBe(attemptAfterRace?.status)
    expect(runAfterRace?.failure).toEqual(attemptAfterRace?.failure)
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "late_failure", message: "The winning success cannot be overwritten." },
        status: "failed",
      }),
    ).toMatchObject({ code: runErrorCodes.transitionInvalid, success: false })
  },
)

test.skipIf(!databaseAvailable)(
  "failed terminal persistence wins a cancellation race without cancellation mutation",
  async () => {
    if (userId === undefined) return
    const created = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: `client-run-failed-before-cancellation-${uuidv7()}`,
      streamId: `run-failed-before-cancellation-${uuidv7()}`,
    })
    if (!created.success) return
    const runId = created.data.run.id
    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "running" })).toMatchObject({
      success: true,
    })
    const failure = { code: "provider_failed", message: "The provider failed before cancellation." }

    const race = terminalPersistenceRaceDatabaseCreate()
    const failedPromise = runTransition(race.database, userId, fixture.sessionId, runId, {
      failure,
      status: "failed",
    })
    await race.firstTransactionStarted
    const cancellationPromise = runCancel(race.database, userId, fixture.sessionId, runId)
    race.releaseFirstTransaction()
    const [failed, cancellation] = await Promise.all([failedPromise, cancellationPromise])

    expect(failed).toMatchObject({
      data: {
        attempt: { failure, status: "failed" },
        changed: true,
        run: {
          cancellationKind: null,
          cancellationRequestedAt: null,
          cancellationSourceRunId: null,
          failure,
          status: "failed",
        },
      },
      success: true,
    })
    expect(cancellation).toMatchObject({
      data: {
        cancelledRunIds: [],
        changed: false,
        descendantsCancelled: 0,
        run: {
          cancellationKind: null,
          cancellationRequestedAt: null,
          cancellationSourceRunId: null,
          failure,
          status: "failed",
        },
      },
      success: true,
    })
    if (!failed.success) return
    expect(failed.data.run.finishedAt).toBeInstanceOf(Date)
    expect(failed.data.attempt.finishedAt).toEqual(failed.data.run.finishedAt)

    const [runAfterRace] = await database.select().from(runTable).where(eq(runTable.id, runId))
    const [attemptAfterRace] = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, runId))
      .orderBy(desc(attemptTable.ordinal))
    expect(runAfterRace).toMatchObject({
      cancellationKind: null,
      cancellationRequestedAt: null,
      cancellationSourceRunId: null,
      failure,
      status: "failed",
    })
    expect(attemptAfterRace).toMatchObject({ failure, status: "failed" })
    expect(runAfterRace?.finishedAt).toBeInstanceOf(Date)
    expect(attemptAfterRace?.finishedAt).toEqual(runAfterRace?.finishedAt)
    expect(runAfterRace?.status).toBe(attemptAfterRace?.status)
    expect(runAfterRace?.failure).toEqual(attemptAfterRace?.failure)
    expect(
      await runTransition(database, userId, fixture.sessionId, runId, {
        failure: { code: "different_failure", message: "The winning failure cannot be overwritten." },
        status: "failed",
      }),
    ).toMatchObject({ code: runErrorCodes.failureMetadataImmutable, success: false })
    expect(await runTransition(database, userId, fixture.sessionId, runId, { status: "succeeded" })).toMatchObject({
      code: runErrorCodes.transitionInvalid,
      success: false,
    })
  },
)

test.skipIf(!databaseAvailable)("retry attempt creation rejects at the immutable deadline boundary", async () => {
  if (userId === undefined) return
  const created = await runCreate(database, userId, fixture.sessionId, {
    ...input,
    budget: { maxAttempts: 3, maxDurationMs: 10_000 },
    clientRunId: `client-run-retry-deadline-${uuidv7()}`,
    streamId: `run-retry-deadline-${uuidv7()}`,
  })
  if (!created.success) return
  expect(
    await runTransition(database, userId, fixture.sessionId, created.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  expect(
    await runTransition(database, userId, fixture.sessionId, created.data.run.id, {
      failure: { code: "provider_timeout", message: "The provider timed out." },
      status: "failed",
    }),
  ).toMatchObject({ success: true })
  expect(
    await runRetryAttemptCreate(database, userId, fixture.sessionId, created.data.run.id, {
      now: () => new Date(created.data.run.deadlineAt),
    }),
  ).toMatchObject({
    code: runErrorCodes.retryNotAdmitted,
    success: false,
    errorMessage: "The run retry was not admitted: deadline_exceeded.",
  })
  expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, created.data.run.id))).toHaveLength(1)
})

test.skipIf(!databaseAvailable)("retry attempt creation admits a still-valid retry before the deadline", async () => {
  if (userId === undefined) return
  const created = await runCreate(database, userId, fixture.sessionId, {
    ...input,
    budget: { maxAttempts: 3, maxDurationMs: 10_000 },
    clientRunId: `client-run-retry-valid-${uuidv7()}`,
    streamId: `run-retry-valid-${uuidv7()}`,
  })
  if (!created.success) return
  expect(
    await runTransition(database, userId, fixture.sessionId, created.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  expect(
    await runTransition(database, userId, fixture.sessionId, created.data.run.id, {
      failure: { code: "provider_timeout", message: "The provider timed out." },
      status: "failed",
    }),
  ).toMatchObject({ success: true })
  expect(
    await runRetryAttemptCreate(database, userId, fixture.sessionId, created.data.run.id, {
      now: () => new Date(created.data.run.deadlineAt.getTime() - 1),
    }),
  ).toMatchObject({ success: true, data: { created: true, attempt: { ordinal: 2 }, run: { status: "accepted" } } })
})

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

test.skipIf(!databaseAvailable)(
  "run delegation persists the bounded tree relationship and rejects inconsistent rows",
  async () => {
    if (userId === undefined) return
    const parent = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxChildDepth: 3, maxChildRuns: 8, maxDurationMs: 10_000 },
      clientRunId: `client-run-delegation-parent-${uuidv7()}`,
      streamId: `run-delegation-parent-${uuidv7()}`,
    })
    const child = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      clientRunId: `client-run-delegation-child-${uuidv7()}`,
      streamId: `run-delegation-child-${uuidv7()}`,
    })
    if (!parent.success || !child.success) return

    const delegation = {
      childRunId: child.data.run.id,
      delegationKey: "task-1",
      depth: 1,
      finalizedResult: { status: "succeeded" as const, text: "completed" },
      id: uuidv7(),
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      rootOrdinal: 1,
      rootRunId: parent.data.run.id,
      sessionId: fixture.sessionId,
      task: "Inspect the requested implementation and report the result.",
      userId,
    }
    const [created] = await database.insert(runDelegationTable).values(delegation).returning()
    expect(created).toMatchObject(delegation)

    await expect(
      (async () => {
        await database.insert(runDelegationTable).values({ ...delegation, id: uuidv7(), delegationKey: "task-2" })
      })(),
    ).rejects.toThrow()
    await expect(
      (async () => {
        await database.insert(runDelegationTable).values({
          ...delegation,
          childRunId: parent.data.run.id,
          delegationKey: "task-3",
          id: uuidv7(),
          parentAttemptId: child.data.attempt.id,
        })
      })(),
    ).rejects.toThrow()
    await expect(
      (async () => {
        await database.insert(runDelegationTable).values({
          ...delegation,
          childRunId: parent.data.run.id,
          id: uuidv7(),
          rootOrdinal: 2,
          task: "",
        })
      })(),
    ).rejects.toThrow()
  },
)

test.skipIf(!databaseAvailable)(
  "child run creation is transactional, idempotent, concurrent-safe, and inherits the root budget/deadline",
  async () => {
    if (userId === undefined) return
    const parent = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxChildDepth: 2, maxChildRuns: 1, maxDurationMs: 10_000 },
      clientRunId: `client-run-child-${uuidv7()}`,
      streamId: `run-child-parent-${uuidv7()}`,
    })
    if (!parent.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, parent.data.run.id, { status: "running" }),
    ).toMatchObject({ success: true })

    const childInput = {
      delegationKey: "child-task-1",
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: "Inspect the requested implementation.",
    }
    const concurrent = await Promise.all([
      runChildCreate(database, userId, fixture.sessionId, childInput),
      runChildCreate(database, userId, fixture.sessionId, childInput),
    ])
    expect(concurrent.map((result) => (result.success ? result.data.created : false)).sort()).toEqual([false, true])

    const admitted = concurrent.find((result) => result.success && result.data.created)
    if (admitted === undefined || !admitted.success) return
    expect(admitted.data).toMatchObject({
      admission: { decision: "admit", reason: "admitted" },
      attempt: { ordinal: 1, snapshot: parent.data.run.snapshot, status: "accepted" },
      created: true,
      delegation: {
        depth: 1,
        parentAttemptId: parent.data.attempt.id,
        parentRunId: parent.data.run.id,
        rootOrdinal: 1,
        rootRunId: parent.data.run.id,
        task: childInput.task,
      },
      run: {
        budget: parent.data.run.budget,
        deadlineAt: parent.data.run.deadlineAt,
        snapshot: parent.data.run.snapshot,
        status: "accepted",
      },
    })
    expect(admitted.data.run.deadlineAt).toEqual(parent.data.run.deadlineAt)

    const replay = await runChildCreate(database, userId, fixture.sessionId, childInput)
    expect(replay).toMatchObject({
      success: true,
      data: { created: false, delegation: { id: admitted.data.delegation.id }, run: { id: admitted.data.run.id } },
    })

    const repeatedToolCall = await runChildCreate(database, userId, fixture.sessionId, {
      ...childInput,
      delegationKey: "child-task-new-tool-call",
    })
    expect(repeatedToolCall).toMatchObject({
      success: true,
      data: { created: false, delegation: { id: admitted.data.delegation.id }, run: { id: admitted.data.run.id } },
    })

    const differentAgent = await runChildCreate(database, userId, fixture.sessionId, {
      ...childInput,
      delegationKey: "child-task-different-agent",
      snapshot: {
        ...parent.data.run.snapshot,
        target: { ...parent.data.run.snapshot.target, agentId: "different-agent" },
      },
    })
    expect(differentAgent).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: child_run_limit_exhausted.",
      success: false,
    })

    const distinctTask = await runChildCreate(database, userId, fixture.sessionId, {
      ...childInput,
      delegationKey: "child-task-distinct",
      task: "Inspect a different requested implementation.",
    })
    expect(distinctTask).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: child_run_limit_exhausted.",
      success: false,
    })
    expect(
      await database.select().from(runDelegationTable).where(eq(runDelegationTable.rootRunId, parent.data.run.id)),
    ).toHaveLength(1)
  },
)

test.skipIf(!databaseAvailable)(
  "child admission rechecks cancellation before persistence and remains idempotent",
  async () => {
    if (userId === undefined) return
    const parent = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxChildDepth: 2, maxChildRuns: 2, maxDurationMs: 10_000 },
      clientRunId: `client-run-child-cancellation-race-${uuidv7()}`,
      streamId: `run-child-cancellation-race-parent-${uuidv7()}`,
    })
    if (!parent.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, parent.data.run.id, { status: "running" }),
    ).toMatchObject({ success: true })

    const childInput = {
      delegationKey: "child-cancellation-race",
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: "The child must not become active after parent cancellation.",
    }
    const runsBefore = await database
      .select({ id: runTable.id })
      .from(runTable)
      .where(and(eq(runTable.sessionId, fixture.sessionId), eq(runTable.userId, userId)))
    const [sessionBefore] = await database
      .select({ revision: sessionTable.revision })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, fixture.sessionId), eq(sessionTable.userId, userId)))
    if (sessionBefore === undefined) return

    const race = childAdmissionRaceDatabaseCreate()
    const childPromise = runRepositoryChildCreate(race.database, userId, fixture.sessionId, childInput, {
      beforeAdmissionCommit: async () => {
        race.markAdmissionObserved()
        await race.admissionGate
      },
    })
    await race.admissionObserved

    const cancellation = await runCancel(database, userId, fixture.sessionId, parent.data.run.id)
    expect(cancellation).toMatchObject({
      data: { cancelledRunIds: [parent.data.run.id], changed: true, descendantsCancelled: 0 },
      success: true,
    })
    race.releaseAdmission()
    const child = await childPromise

    expect(child).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: cancelled.",
      success: false,
    })
    expect(
      await database.select().from(runDelegationTable).where(eq(runDelegationTable.rootRunId, parent.data.run.id)),
    ).toHaveLength(0)
    expect(await database.select().from(attemptTable).where(eq(attemptTable.runId, parent.data.run.id))).toHaveLength(1)
    const runsAfter = await database
      .select({ id: runTable.id })
      .from(runTable)
      .where(and(eq(runTable.sessionId, fixture.sessionId), eq(runTable.userId, userId)))
    expect(runsAfter).toEqual(runsBefore)
    const [sessionAfter] = await database
      .select({ revision: sessionTable.revision })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, fixture.sessionId), eq(sessionTable.userId, userId)))
    expect(sessionAfter).toEqual(sessionBefore)

    expect(await runCancel(database, userId, fixture.sessionId, parent.data.run.id)).toMatchObject({
      data: { cancelledRunIds: [], changed: false, descendantsCancelled: 0 },
      success: true,
    })
    expect(await runChildCreate(database, userId, fixture.sessionId, childInput)).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: cancelled.",
      success: false,
    })
    expect(
      await runChildCreate(database, userId, fixture.sessionId, {
        ...childInput,
        delegationKey: "child-cancellation-race-repeated",
      }),
    ).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: cancelled.",
      success: false,
    })
  },
)

test.skipIf(!databaseAvailable)(
  "child run creation rejects durable deadline, depth, and descendant boundaries",
  async () => {
    if (userId === undefined) return
    const parent = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxChildDepth: 1, maxChildRuns: 3, maxDurationMs: 10_000 },
      clientRunId: `client-run-child-boundary-${uuidv7()}`,
      streamId: `run-child-boundary-parent-${uuidv7()}`,
    })
    if (!parent.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, parent.data.run.id, { status: "running" }),
    ).toMatchObject({ success: true })

    const childInput = (delegationKey: string) => ({
      delegationKey,
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: `Run a bounded child task: ${delegationKey}.`,
    })
    expect(await runChildCreate(database, userId, fixture.sessionId, childInput("boundary-child-1"))).toMatchObject({
      success: true,
      data: { created: true },
    })
    const child = await database
      .select()
      .from(runDelegationTable)
      .where(and(eq(runDelegationTable.rootRunId, parent.data.run.id), eq(runDelegationTable.rootOrdinal, 1)))
    const firstChild = child[0]
    if (firstChild === undefined) return
    const [firstChildAttempt] = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, firstChild.childRunId))
      .orderBy(asc(attemptTable.ordinal))
    if (firstChildAttempt === undefined) return
    expect(
      await runTransition(database, userId, fixture.sessionId, firstChild.childRunId, { status: "running" }),
    ).toMatchObject({
      success: true,
    })
    expect(
      await runChildCreate(database, userId, fixture.sessionId, {
        delegationKey: "boundary-depth-1",
        parentAttemptId: firstChildAttempt.id,
        parentRunId: firstChild.childRunId,
        task: "This task is beyond the root depth budget.",
      }),
    ).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: child_depth_limit_exhausted.",
      success: false,
    })

    expect(await runChildCreate(database, userId, fixture.sessionId, childInput("boundary-child-2"))).toMatchObject({
      success: true,
      data: { created: true },
    })
    expect(await runChildCreate(database, userId, fixture.sessionId, childInput("boundary-child-3"))).toMatchObject({
      success: true,
      data: { created: true },
    })
    expect(await runChildCreate(database, userId, fixture.sessionId, childInput("boundary-child-4"))).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: child_run_limit_exhausted.",
      success: false,
    })

    await database
      .update(runTable)
      .set({ deadlineAt: new Date(0) })
      .where(eq(runTable.id, parent.data.run.id))
    expect(await runChildCreate(database, userId, fixture.sessionId, childInput("boundary-deadline"))).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: deadline_exceeded.",
      success: false,
    })
  },
)

test.skipIf(!databaseAvailable)("child run creation rejects an immutable delegation-key conflict", async () => {
  if (userId === undefined) return
  const parent = await runCreate(database, userId, fixture.sessionId, {
    ...input,
    budget: { maxChildDepth: 1, maxChildRuns: 2, maxDurationMs: 10_000 },
    clientRunId: `client-run-child-conflict-${uuidv7()}`,
    streamId: `run-child-conflict-parent-${uuidv7()}`,
  })
  if (!parent.success) return
  expect(
    await runTransition(database, userId, fixture.sessionId, parent.data.run.id, { status: "running" }),
  ).toMatchObject({ success: true })
  const childInput = {
    delegationKey: "immutable-child-key",
    parentAttemptId: parent.data.attempt.id,
    parentRunId: parent.data.run.id,
    task: "The original immutable task.",
  }
  const created = await runChildCreate(database, userId, fixture.sessionId, childInput)
  expect(created).toMatchObject({ success: true, data: { created: true } })
  if (!created.success) return

  expect(
    await runChildCreate(database, userId, fixture.sessionId, { ...childInput, task: "A conflicting task." }),
  ).toMatchObject({
    code: runErrorCodes.delegationConflict,
    errorMessage: "The delegation key conflicts with a different task.",
    success: false,
  })
  expect(
    await database.select().from(runDelegationTable).where(eq(runDelegationTable.rootRunId, parent.data.run.id)),
  ).toHaveLength(1)
})

test.skipIf(!databaseAvailable)(
  "delegation finalization atomically terminalizes the child and is idempotent without allowing overwrites",
  async () => {
    if (userId === undefined) return
    const parent = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxChildDepth: 1, maxChildRuns: 5, maxDurationMs: 10_000 },
      clientRunId: `client-run-finalize-${uuidv7()}`,
      streamId: `run-finalize-parent-${uuidv7()}`,
    })
    if (!parent.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, parent.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })

    const child = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "finalize-child",
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: "Complete the delegated finalization test.",
    })
    if (!child.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, child.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })

    const result = { status: "succeeded" as const, text: "The child completed successfully." }
    expect(
      await runDelegationFinalize(database, userId, fixture.sessionId, child.data.delegation.id, result, {
        attemptUpdate: async () => createResultError("failureInjection", "The child attempt update failed."),
      }),
    ).toMatchObject({
      errorMessage: "The child attempt update failed.",
      success: false,
    })
    const [rolledBackRun] = await database.select().from(runTable).where(eq(runTable.id, child.data.run.id))
    const [rolledBackAttempt] = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.id, child.data.attempt.id))
    const [rolledBackDelegation] = await database
      .select()
      .from(runDelegationTable)
      .where(eq(runDelegationTable.id, child.data.delegation.id))
    expect(rolledBackRun).toMatchObject({ failure: null, finishedAt: null, status: "running" })
    expect(rolledBackAttempt).toMatchObject({ failure: null, finishedAt: null, status: "running" })
    expect(rolledBackDelegation?.finalizedResult).toBeNull()

    const finalized = await runDelegationFinalize(database, userId, fixture.sessionId, child.data.delegation.id, result)
    expect(finalized).toMatchObject({
      success: true,
      data: {
        changed: true,
        delegation: { finalizedResult: result },
        run: { id: child.data.run.id, failure: null, status: "succeeded" },
        attempt: { failure: null, status: "succeeded" },
      },
    })

    expect(
      await runDelegationFinalize(database, userId, fixture.sessionId, child.data.delegation.id, result),
    ).toMatchObject({ success: true, data: { changed: false } })
    expect(
      await runDelegationFinalize(database, userId, fixture.sessionId, child.data.delegation.id, {
        status: "succeeded",
        text: "A conflicting result.",
      }),
    ).toMatchObject({
      code: runErrorCodes.delegationFinalizationConflict,
      errorMessage: "The finalized delegation result cannot be overwritten.",
      success: false,
    })
    expect(
      await runDelegationFinalize(
        database,
        "development:unknown-run-user",
        fixture.sessionId,
        child.data.delegation.id,
        result,
      ),
    ).toMatchObject({
      code: runErrorCodes.sessionNotFound,
      errorMessage: "The session could not be found.",
      success: false,
    })
    expect(
      await runDelegationFinalize(database, userId, fixture.sessionId, child.data.delegation.id, {
        failure: { code: "different_status", message: "A conflicting terminal result." },
        status: "failed",
        text: "A conflicting terminal result.",
      }),
    ).toMatchObject({
      code: runErrorCodes.delegationFinalizationConflict,
      success: false,
    })

    const concurrentChild = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "finalize-concurrent-child",
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: "Complete the concurrent finalization test.",
    })
    if (!concurrentChild.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, concurrentChild.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })
    const concurrentResult = { status: "succeeded" as const, text: "The concurrent child completed successfully." }
    const race = terminalPersistenceRaceDatabaseCreate()
    const firstFinalization = runDelegationFinalize(
      race.database,
      userId,
      fixture.sessionId,
      concurrentChild.data.delegation.id,
      concurrentResult,
    )
    await race.firstTransactionStarted
    const secondFinalization = runDelegationFinalize(
      race.database,
      userId,
      fixture.sessionId,
      concurrentChild.data.delegation.id,
      concurrentResult,
    )
    race.releaseFirstTransaction()
    const concurrentFinalizations = await Promise.all([firstFinalization, secondFinalization])
    expect(
      concurrentFinalizations.filter((finalization) => finalization.success && finalization.data.changed),
    ).toHaveLength(1)
    expect(
      concurrentFinalizations.filter((finalization) => finalization.success && !finalization.data.changed),
    ).toHaveLength(1)
    const [concurrentRun] = await database.select().from(runTable).where(eq(runTable.id, concurrentChild.data.run.id))
    const [concurrentAttempt] = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, concurrentChild.data.run.id))
    const [concurrentDelegation] = await database
      .select()
      .from(runDelegationTable)
      .where(eq(runDelegationTable.id, concurrentChild.data.delegation.id))
    expect(concurrentRun).toMatchObject({ status: "succeeded" })
    expect(concurrentAttempt).toMatchObject({ status: "succeeded" })
    expect(concurrentDelegation?.finalizedResult).toEqual(concurrentResult)

    const failedChild = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "finalize-failed-child",
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: "Complete the delegated failure test.",
    })
    if (!failedChild.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, failedChild.data.run.id, { status: "running" }),
    ).toMatchObject({ success: true })
    expect(
      await runDelegationFinalize(database, userId, fixture.sessionId, failedChild.data.delegation.id, {
        failure: { code: "child_failed", message: "The child failed." },
        status: "failed",
        text: "The delegated task failed.",
      }),
    ).toMatchObject({
      success: true,
      data: {
        run: { failure: { code: "child_failed" }, status: "failed" },
        attempt: { failure: { code: "child_failed" }, status: "failed" },
      },
    })

    const abortedChild = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "finalize-aborted-child",
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: "Complete the delegated abort test.",
    })
    if (!abortedChild.success) return
    expect(
      await runDelegationFinalize(database, userId, fixture.sessionId, abortedChild.data.delegation.id, {
        failure: { code: "child_aborted", message: "The child was aborted." },
        status: "aborted",
        text: "The delegated task was aborted.",
      }),
    ).toMatchObject({
      success: true,
      data: {
        run: { failure: { code: "child_aborted" }, status: "aborted" },
        attempt: { failure: { code: "child_aborted" }, status: "aborted" },
      },
    })

    const invalidChild = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "finalize-invalid-child",
      parentAttemptId: parent.data.attempt.id,
      parentRunId: parent.data.run.id,
      task: "Reject the invalid lifecycle.",
    })
    if (!invalidChild.success) return
    expect(
      await runDelegationFinalize(database, userId, fixture.sessionId, invalidChild.data.delegation.id, result),
    ).toMatchObject({
      code: runErrorCodes.delegationFinalizationConflict,
      errorMessage: "The child run lifecycle does not allow delegation finalization.",
      success: false,
    })
  },
)

test.skipIf(!databaseAvailable)(
  "cancellation is idempotent, propagates only to nonterminal descendants, and blocks later child admission",
  async () => {
    if (userId === undefined) return
    const root = await runCreate(database, userId, fixture.sessionId, {
      ...input,
      budget: { maxChildDepth: 3, maxChildRuns: 8, maxDurationMs: 10_000 },
      clientRunId: `client-run-cancellation-${uuidv7()}`,
      streamId: `run-cancellation-root-${uuidv7()}`,
    })
    if (!root.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, root.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })

    const child = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "cancellation-child",
      parentAttemptId: root.data.attempt.id,
      parentRunId: root.data.run.id,
      task: "The child run to cancel.",
    })
    if (!child.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, child.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })

    const sibling = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "cancellation-sibling",
      parentAttemptId: root.data.attempt.id,
      parentRunId: root.data.run.id,
      task: "The sibling run must remain uncancelled.",
    })
    if (!sibling.success) return

    const grandchild = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "cancellation-grandchild",
      parentAttemptId: child.data.attempt.id,
      parentRunId: child.data.run.id,
      task: "The descendant run to cancel by ancestry.",
    })
    if (!grandchild.success) return
    const completedDescendant = await runChildCreate(database, userId, fixture.sessionId, {
      delegationKey: "cancellation-completed-descendant",
      parentAttemptId: child.data.attempt.id,
      parentRunId: child.data.run.id,
      task: "The terminal descendant must remain unchanged.",
    })
    if (!completedDescendant.success) return
    expect(
      await runTransition(database, userId, fixture.sessionId, completedDescendant.data.run.id, { status: "running" }),
    ).toMatchObject({ success: true })
    expect(
      await runTransition(database, userId, fixture.sessionId, completedDescendant.data.run.id, {
        status: "succeeded",
      }),
    ).toMatchObject({ success: true })

    const cancelled = await runCancel(database, userId, fixture.sessionId, child.data.run.id, { kind: "requested" })
    expect(cancelled).toMatchObject({
      success: true,
      data: {
        cancelledRunIds: [child.data.run.id, grandchild.data.run.id],
        changed: true,
        descendantsCancelled: 1,
        run: { id: child.data.run.id, cancellationKind: "requested", status: "running" },
      },
    })
    if (!cancelled.success) return
    expect(cancelled.data.run.cancellationRequestedAt).toBeInstanceOf(Date)
    expect(cancelled.data.run.cancellationSourceRunId).toBeNull()

    const [cancelledChild, cancelledGrandchild, unchangedRoot, unchangedSibling, unchangedCompletedDescendant] =
      await Promise.all(
        [
          child.data.run.id,
          grandchild.data.run.id,
          root.data.run.id,
          sibling.data.run.id,
          completedDescendant.data.run.id,
        ].map(async (id) => {
          const [run] = await database.select().from(runTable).where(eq(runTable.id, id))
          return run
        }),
      )
    expect(cancelledGrandchild).toMatchObject({
      cancellationKind: "ancestor",
      cancellationSourceRunId: child.data.run.id,
    })
    expect(cancelledGrandchild?.cancellationRequestedAt).toEqual(cancelledChild?.cancellationRequestedAt)
    expect(unchangedRoot).toMatchObject({ cancellationKind: null, cancellationRequestedAt: null })
    expect(unchangedSibling).toMatchObject({ cancellationKind: null, cancellationRequestedAt: null })
    expect(unchangedCompletedDescendant).toMatchObject({
      cancellationKind: null,
      cancellationRequestedAt: null,
      status: "succeeded",
    })

    expect(
      await runCancel(database, "development:unknown-run-user", fixture.sessionId, child.data.run.id),
    ).toMatchObject({
      code: runErrorCodes.notFound,
      errorMessage: "The run could not be found.",
      success: false,
    })
    expect(await runCancel(database, userId, fixture.sessionId, completedDescendant.data.run.id)).toMatchObject({
      success: true,
      data: { cancelledRunIds: [], changed: false, descendantsCancelled: 0 },
    })

    const repeated = await runCancel(database, userId, fixture.sessionId, child.data.run.id, { kind: "requested" })
    expect(repeated).toMatchObject({
      success: true,
      data: { cancelledRunIds: [], changed: false, descendantsCancelled: 0 },
    })
    if (!repeated.success || !cancelled.success) return
    expect(repeated.data.run.cancellationRequestedAt).toEqual(cancelled.data.run.cancellationRequestedAt)

    expect(
      await runChildCreate(database, userId, fixture.sessionId, {
        delegationKey: "cancellation-after-request",
        parentAttemptId: child.data.attempt.id,
        parentRunId: child.data.run.id,
        task: "This child must not be admitted beneath cancelled ancestry.",
      }),
    ).toMatchObject({
      code: runErrorCodes.childNotAdmitted,
      errorMessage: "The child run was not admitted: cancelled.",
      success: false,
    })
  },
)
