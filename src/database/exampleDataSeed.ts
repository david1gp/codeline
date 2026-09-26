import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, inArray } from "drizzle-orm"
import { agentTable } from "../agents/db/agentTable.js"
import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import { applicationUserTable } from "../identity/db/applicationUserTable.js"
import { externalIdentityUpsert } from "../identity/db/externalIdentityUpsert.js"
import { organizationMemberTable } from "../identity/db/organizationMemberTable.js"
import { organizationTable } from "../identity/db/organizationTable.js"
import { journalEventTable } from "../journal/db/journalEventTable.js"
import { messageApiRecordCreate } from "../message/api/messageApiRecordCreate.js"
import { messageTable } from "../message/db/messageTable.js"
import { projectConfiguredRootsReconcile } from "../project/db/projectConfiguredRootsReconcile.js"
import { projectFolderBootstrapEnsure } from "../project/db/projectFolderBootstrapEnsure.js"
import { projectFolderBootstrapIdLoad } from "../project/db/projectFolderBootstrapIdLoad.js"
import { projectTable } from "../project/db/projectTable.js"
import { providerAgentCatalogAgentNameCreate } from "../providers/catalog/providerAgentCatalogAgentNameCreate.js"
import { providerAgentCatalogConfigurationCompile } from "../providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../providers/catalog/providerAgentCatalogLoad.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { runCancel } from "../run/actions/runCancel.js"
import { runChildCreate } from "../run/actions/runChildCreate.js"
import { runCreate } from "../run/actions/runCreate.js"
import { runDelegationFinalize } from "../run/actions/runDelegationFinalize.js"
import { runProviderOutputCreate } from "../run/actions/runProviderOutputCreate.js"
import { runStartupInterruptionReconcile } from "../run/actions/runStartupInterruptionReconcile.js"
import { runTransition } from "../run/actions/runTransition.js"
import { attemptTable } from "../run/db/attemptTable.js"
import { runActiveStateTable } from "../run/db/runActiveStateTable.js"
import { runDelegationTable } from "../run/db/runDelegationTable.js"
import { runFinalizedDetailTable } from "../run/db/runFinalizedDetailTable.js"
import { runHistoryEntryPayloadCreate } from "../run/db/runHistoryEntryPayloadCreate.js"
import { runTable } from "../run/db/runTable.js"
import { serverTable } from "../servers/db/serverTable.js"
import { sessionHistoryEntryRepositoryUpsert } from "../session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionHistoryEntryTable } from "../session/db/sessionHistoryEntryTable.js"
import { sessionTable } from "../session/db/sessionTable.js"
import { sessionViewTable } from "../session/db/sessionViewTable.js"
import { uuidv7 } from "../uuid/uuidv7.js"
import type { DatabaseClient, DatabaseExecutor } from "./databaseClient.js"
import { databaseTransactionRun } from "./databaseTransactionRun.js"
import { exampleDataConfigurationReconcile } from "./exampleDataConfigurationReconcile.js"
import { exampleDataFixture } from "./exampleDataFixture.js"

function date(value: string): Date {
  return new Date(value)
}

function catalogAgentMode(configuration: AgentConfiguration): "primary" | "subagent" {
  if (configuration.provider === "deterministic") return "subagent"
  return configuration.catalogAgent?.mode ?? "subagent"
}

function exampleDataJsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(exampleDataJsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${exampleDataJsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

async function exampleDataMessagesDelete(database: DatabaseExecutor): Promise<void> {
  const messageIds = exampleDataFixture.sessions.flatMap((session) => session.messages.map((message) => message.id))

  await database.delete(messageTable).where(inArray(messageTable.id, messageIds))
}

async function exampleDataOwnedRunRowsDelete(database: DatabaseExecutor): Promise<void> {
  const runIds = exampleDataFixture.runs.map((run) => run.id)
  const attemptIds = exampleDataFixture.attempts.map((attempt) => attempt.id)
  const sessionIds = exampleDataFixture.sessionViews.map((sessionView) => sessionView.sessionId)

  await database.delete(journalEventTable).where(inArray(journalEventTable.runId, runIds))
  await database.delete(runDelegationTable).where(
    inArray(
      runDelegationTable.id,
      exampleDataFixture.delegations.map((delegation) => delegation.id),
    ),
  )
  await database.delete(runFinalizedDetailTable).where(inArray(runFinalizedDetailTable.runId, runIds))
  await database.delete(runActiveStateTable).where(inArray(runActiveStateTable.runId, runIds))
  await database.delete(attemptTable).where(inArray(attemptTable.id, attemptIds))
  await database.delete(runTable).where(inArray(runTable.id, runIds))
  await database.delete(sessionViewTable).where(inArray(sessionViewTable.sessionId, sessionIds))
}

async function exampleDataRunRowsAlreadySeeded(database: DatabaseExecutor, userId: string): Promise<boolean> {
  try {
    const runIds = exampleDataFixture.runs.map((run) => run.id)
    const runs = await database
      .select({
        cancellationKind: runTable.cancellationKind,
        failure: runTable.failure,
        id: runTable.id,
        status: runTable.status,
      })
      .from(runTable)
      .where(and(eq(runTable.userId, userId), inArray(runTable.id, runIds)))
    if (runs.length !== runIds.length) return false
    if (
      runs.some((run) => {
        const fixtureRun = exampleDataFixture.runs.find((candidate) => candidate.id === run.id)
        return (
          fixtureRun === undefined ||
          run.status !== fixtureRun.status ||
          JSON.stringify(run.failure) !== JSON.stringify(fixtureRun.failure) ||
          run.cancellationKind !== fixtureRun.cancellationKind
        )
      })
    )
      return false

    const attemptIds = exampleDataFixture.attempts.map((attempt) => attempt.id)
    const attempts = await database
      .select({ id: attemptTable.id, status: attemptTable.status })
      .from(attemptTable)
      .where(and(eq(attemptTable.userId, userId), inArray(attemptTable.id, attemptIds)))
    if (attempts.length !== attemptIds.length) return false
    if (
      attempts.some((attempt) => {
        const fixtureAttempt = exampleDataFixture.attempts.find((candidate) => candidate.id === attempt.id)
        return fixtureAttempt === undefined || attempt.status !== fixtureAttempt.status
      })
    )
      return false

    const details = await database
      .select({ runId: runFinalizedDetailTable.runId })
      .from(runFinalizedDetailTable)
      .where(and(eq(runFinalizedDetailTable.userId, userId), inArray(runFinalizedDetailTable.runId, runIds)))
    if (details.length !== runIds.length) return false

    const delegations = await database
      .select({ id: runDelegationTable.id, finalizedResult: runDelegationTable.finalizedResult })
      .from(runDelegationTable)
      .where(
        and(
          eq(runDelegationTable.userId, userId),
          inArray(
            runDelegationTable.id,
            exampleDataFixture.delegations.map((delegation) => delegation.id),
          ),
        ),
      )
    if (delegations.length !== exampleDataFixture.delegations.length) return false
    if (delegations.some((delegation) => delegation.finalizedResult === null)) return false

    const activeStates = await database
      .select({ runId: runActiveStateTable.runId })
      .from(runActiveStateTable)
      .where(and(eq(runActiveStateTable.userId, userId), inArray(runActiveStateTable.runId, runIds)))
    if (activeStates.length !== 0) return false

    const entries = await database
      .select({
        kind: sessionHistoryEntryTable.kind,
        payload: sessionHistoryEntryTable.payload,
        sourceDetailId: sessionHistoryEntryTable.sourceDetailId,
        sourceId: sessionHistoryEntryTable.sourceId,
        sourceType: sessionHistoryEntryTable.sourceType,
        sessionId: sessionHistoryEntryTable.sessionId,
      })
      .from(sessionHistoryEntryTable)
      .where(
        and(
          eq(sessionHistoryEntryTable.userId, userId),
          inArray(
            sessionHistoryEntryTable.sessionId,
            exampleDataFixture.sessions.map((session) => session.id),
          ),
        ),
      )
    const entryBySource = new Map(
      entries.map(
        (entry) =>
          [
            `${entry.sessionId}\u0000${entry.sourceType}\u0000${entry.sourceId}\u0000${entry.sourceDetailId}`,
            entry,
          ] as const,
      ),
    )
    for (const fixtureRun of exampleDataFixture.runs) {
      const entry = entryBySource.get(`${fixtureRun.sessionId}\u0000run\u0000${fixtureRun.id}\u0000`)
      if (
        entry === undefined ||
        entry.kind !== "run" ||
        exampleDataJsonCanonicalize(entry.payload) !==
          exampleDataJsonCanonicalize(
            runHistoryEntryPayloadCreate({
              id: fixtureRun.id,
              status: fixtureRun.status,
              terminalKind: fixtureRun.outcome,
            }),
          )
      )
        return false
    }
    for (const fixtureTool of exampleDataFixture.tools) {
      const fixtureRun = exampleDataFixture.runs.find((run) => run.id === fixtureTool.runId)
      if (
        fixtureRun === undefined ||
        entryBySource.get(`${fixtureRun.sessionId}\u0000tool\u0000${fixtureTool.runId}\u0000${fixtureTool.toolCallId}`)
          ?.kind !== "tool"
      )
        return false
    }
    for (const delegation of exampleDataFixture.delegations) {
      const parentRun = exampleDataFixture.runs.find((run) => run.id === delegation.parentRunId)
      if (
        parentRun === undefined ||
        entryBySource.get(
          `${parentRun.sessionId}\u0000tool\u0000${delegation.parentRunId}\u0000${delegation.delegationKey}`,
        )?.kind !== "tool"
      )
        return false
    }
    return true
  } catch (_error) {
    return false
  }
}

async function exampleDataHistoryRowsDelete(database: DatabaseExecutor): Promise<void> {
  await database.delete(sessionHistoryEntryTable).where(
    inArray(
      sessionHistoryEntryTable.sessionId,
      exampleDataFixture.sessions.map((session) => session.id),
    ),
  )
}

async function exampleDataConfiguredFixtureRowsDelete(
  database: DatabaseExecutor,
  userId: string,
  configuredProjectPaths: readonly string[],
): Promise<void> {
  await exampleDataMessagesDelete(database)
  await exampleDataOwnedRunRowsDelete(database)

  const fixtureSessionIds = exampleDataFixture.sessions.map((session) => session.id)
  await database.delete(sessionTable).where(inArray(sessionTable.id, fixtureSessionIds))

  const configuredPaths = new Set(configuredProjectPaths)
  const staleFixtureProjectPaths = exampleDataFixture.projects
    .map((project) => project.path)
    .filter((projectPath) => !configuredPaths.has(projectPath))
  if (staleFixtureProjectPaths.length === 0) return

  await database
    .delete(projectTable)
    .where(and(eq(projectTable.userId, userId), inArray(projectTable.path, staleFixtureProjectPaths)))
}

async function exampleDataProjectsReconcile(database: DatabaseExecutor, userId: string): Promise<Result<void>> {
  const op = "exampleDataProjectsReconcile"
  const bootstrapped = await projectFolderBootstrapEnsure(database, userId)
  if (!bootstrapped.success) return createResultError(op, bootstrapped.errorMessage)

  try {
    for (const fixtureProject of exampleDataFixture.projects) {
      const folder = await projectFolderBootstrapIdLoad(database, userId, fixtureProject.folderKey)
      if (!folder.success) return createResultError(op, folder.errorMessage)
      if (folder.data === undefined) return createResultError(op, "The example project folder could not be found.")

      await database
        .insert(projectTable)
        .values({
          createdAt: date(fixtureProject.createdAt),
          displayName: fixtureProject.displayName,
          id: userId === exampleDataFixture.user.id ? fixtureProject.id : uuidv7(),
          parentFolderId: folder.data,
          path: fixtureProject.path,
          updatedAt: date(fixtureProject.updatedAt),
          userId,
        })
        .onConflictDoUpdate({
          target: [projectTable.userId, projectTable.path],
          set: {
            displayName: fixtureProject.displayName,
            parentFolderId: folder.data,
            updatedAt: date(fixtureProject.updatedAt),
          },
        })
    }

    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The example projects could not be reconciled.")
  }
}

const exampleDataScheduler = {
  clearTimeout: (_handle: unknown) => undefined,
  setTimeout: (_handler: () => void, _timeoutMs: number) => 1,
}

async function exampleDataJournalPostCommitPublish(): Promise<Result<void>> {
  return createResult(undefined)
}

function exampleDataRunTransitionCreate(fixtureRun: (typeof exampleDataFixture.runs)[number]) {
  return (
    database: DatabaseExecutor,
    userId: string,
    sessionId: string,
    runId: string,
    input: Parameters<typeof runTransition>[4],
  ) =>
    runTransition(database, userId, sessionId, runId, input, {
      now: () => date(input.status === "running" ? fixtureRun.startedAt : fixtureRun.finishedAt),
    })
}

function exampleDataRunProviderCreate(
  database: DatabaseExecutor,
  userId: string,
  fixtureRun: (typeof exampleDataFixture.runs)[number],
) {
  return runProviderOutputCreate({
    database,
    journalPostCommitPublish: exampleDataJournalPostCommitPublish,
    requestId: `example-data-${fixtureRun.clientRunId}`,
    runId: fixtureRun.id,
    scheduler: exampleDataScheduler,
    sessionId: fixtureRun.sessionId,
    userId,
    runTransition: exampleDataRunTransitionCreate(fixtureRun),
  })
}

async function exampleDataRunToolsAppend(
  provider: ReturnType<typeof runProviderOutputCreate>,
  tools: readonly (typeof exampleDataFixture.tools)[number][],
): Promise<Result<void>> {
  const op = "exampleDataRunToolsAppend"
  for (const tool of tools) {
    for (const event of [
      { eventType: "tool_start", payload: { toolCallId: tool.toolCallId, toolName: tool.toolName } },
      { eventType: "tool_output", payload: { output: tool.output, toolCallId: tool.toolCallId, truncated: false } },
      {
        eventType: "tool_result",
        payload: {
          outcome: tool.outcome,
          result: tool.result,
          toolCallId: tool.toolCallId,
          truncated: false,
          workingDirectory: tool.workingDirectory,
        },
      },
    ]) {
      const appended = await provider.append(event)
      if (!appended.success) return createResultError(op, appended.errorMessage)
      const flushed = await provider.flush()
      if (!flushed.success) return createResultError(op, flushed.errorMessage)
    }
  }
  return createResult(undefined)
}

async function exampleDataRunStartAndTools(
  database: DatabaseExecutor,
  userId: string,
  fixtureRun: (typeof exampleDataFixture.runs)[number],
): Promise<Result<ReturnType<typeof runProviderOutputCreate>>> {
  const provider = exampleDataRunProviderCreate(database, userId, fixtureRun)
  const started = await provider.start()
  if (!started.success) return createResultError("exampleDataRunsReconcile", started.errorMessage)
  const tools = await exampleDataRunToolsAppend(
    provider,
    exampleDataFixture.tools.filter((tool) => tool.runId === fixtureRun.id),
  )
  if (!tools.success) return tools
  return createResult(provider)
}

async function exampleDataRunFinalize(
  provider: ReturnType<typeof runProviderOutputCreate>,
  userId: string,
  fixtureRun: (typeof exampleDataFixture.runs)[number],
  database: DatabaseExecutor,
): Promise<Result<void>> {
  if (fixtureRun.outcome === "cancelled") {
    const cancellation = await runCancel(
      database,
      userId,
      fixtureRun.sessionId,
      fixtureRun.id,
      {},
      {
        now: () => date(fixtureRun.cancellationRequestedAt),
      },
    )
    if (!cancellation.success) return createResultError("exampleDataRunsReconcile", cancellation.errorMessage)
  }

  const finalized = await provider.finalize({
    ...(fixtureRun.failure === null ? {} : { failure: fixtureRun.failure }),
    ...(fixtureRun.outcome === "cancelled" ? { reason: "The deterministic example run was cancelled." } : {}),
    status: fixtureRun.status === "succeeded" ? "succeeded" : fixtureRun.status === "failed" ? "failed" : "aborted",
  })
  if (!finalized.success) return createResultError("exampleDataRunsReconcile", finalized.errorMessage)
  return createResult(undefined)
}

async function exampleDataDelegatedChildReconcile(
  database: DatabaseExecutor,
  userId: string,
  delegation: (typeof exampleDataFixture.delegations)[number],
): Promise<Result<void>> {
  const parent = exampleDataFixture.runs.find((run) => run.id === delegation.parentRunId)
  const child = exampleDataFixture.runs.find((run) => run.id === delegation.childRunId)
  if (parent === undefined || child === undefined)
    return createResultError("exampleDataRunsReconcile", "The delegated example runs are missing.")

  const created = await runChildCreate(
    database,
    userId,
    parent.sessionId,
    {
      delegationKey: delegation.delegationKey,
      parentAttemptId: delegation.parentAttemptId,
      parentRunId: delegation.parentRunId,
      snapshot: child.snapshot,
      task: delegation.task,
    },
    undefined,
    {
      attemptId:
        child.id === undefined
          ? undefined
          : exampleDataFixture.attempts.find((attempt) => attempt.runId === child.id)?.id,
      delegationId: delegation.id,
      id: child.id,
      now: () => date(child.createdAt),
    },
  )
  if (!created.success) return createResultError("exampleDataRunsReconcile", created.errorMessage)

  const childStarted = await exampleDataRunStartAndTools(database, userId, child)
  if (!childStarted.success) return childStarted
  // Delegation finalization is the authoritative child terminal write; keep the deltas available for its first detail.
  const finalized = await runDelegationFinalize(
    database,
    userId,
    parent.sessionId,
    delegation.id,
    delegation.finalizedResult,
    {
      now: () => date(child.finishedAt),
    },
  )
  if (!finalized.success) return createResultError("exampleDataRunsReconcile", finalized.errorMessage)
  return createResult(undefined)
}

async function exampleDataRunsReconcile(database: DatabaseExecutor, userId: string): Promise<Result<void>> {
  const op = "exampleDataRunsReconcile"

  try {
    if (await exampleDataRunRowsAlreadySeeded(database, userId)) return createResult(undefined)
    const childRunIds = new Set(exampleDataFixture.delegations.map((delegation) => delegation.childRunId))
    const rootRuns = exampleDataFixture.runs.filter((fixtureRun) => !childRunIds.has(fixtureRun.id))
    const providers = new Map<string, ReturnType<typeof runProviderOutputCreate>>()
    for (const fixtureRun of rootRuns) {
      const created = await runCreate(
        database,
        userId,
        fixtureRun.sessionId,
        {
          budget: fixtureRun.budget,
          clientRunId: fixtureRun.clientRunId,
          snapshot: fixtureRun.snapshot,
          streamId: fixtureRun.streamId,
        },
        {
          attemptId: exampleDataFixture.attempts.find((attempt) => attempt.runId === fixtureRun.id)?.id,
          id: fixtureRun.id,
          now: () => date(fixtureRun.createdAt),
        },
      )
      if (!created.success) return createResultError(op, created.errorMessage)
      const started = await exampleDataRunStartAndTools(database, userId, fixtureRun)
      if (!started.success) return started
      providers.set(fixtureRun.id, started.data)
    }

    for (const delegation of exampleDataFixture.delegations) {
      const child = await exampleDataDelegatedChildReconcile(database, userId, delegation)
      if (!child.success) return child
    }

    for (const fixtureRun of rootRuns) {
      if (fixtureRun.outcome === "interrupted") continue
      const provider = providers.get(fixtureRun.id)
      if (provider === undefined) return createResultError(op, "The example run provider is missing.")
      const finalized = await exampleDataRunFinalize(provider, userId, fixtureRun, database)
      if (!finalized.success) return finalized
    }

    const interruptedRun = exampleDataFixture.runs.find((run) => run.id === "example-run-interrupted-1")
    if (interruptedRun === undefined) return createResultError(op, "The interrupted example run is missing.")
    const interrupted = await runStartupInterruptionReconcile({
      database,
      now: () => date(interruptedRun.finishedAt),
      postCommitPublish: exampleDataJournalPostCommitPublish,
    })
    if (!interrupted.success) return createResultError(op, interrupted.errorMessage)
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The example runs could not be reconciled.")
  }
}

async function exampleDataSessionViewsReconcile(database: DatabaseExecutor, userId: string): Promise<Result<void>> {
  const op = "exampleDataSessionViewsReconcile"

  try {
    for (const fixtureSessionView of exampleDataFixture.sessionViews) {
      await database
        .insert(sessionViewTable)
        .values({
          acknowledgedFinishedAt: date(fixtureSessionView.acknowledgedFinishedAt),
          createdAt: date(fixtureSessionView.createdAt),
          sessionId: fixtureSessionView.sessionId,
          updatedAt: date(fixtureSessionView.updatedAt),
          userId,
        })
        .onConflictDoUpdate({
          target: [sessionViewTable.userId, sessionViewTable.sessionId],
          set: {
            acknowledgedFinishedAt: date(fixtureSessionView.acknowledgedFinishedAt),
            createdAt: date(fixtureSessionView.createdAt),
            updatedAt: date(fixtureSessionView.updatedAt),
          },
        })
    }

    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The example session views could not be reconciled.")
  }
}

async function exampleDataOrganizationReconcile(
  database: DatabaseExecutor,
  organizationExternalId: string,
): Promise<Result<void>> {
  const op = "exampleDataOrganizationReconcile"

  try {
    const [existingOrganization] = await database
      .select({ id: organizationTable.id, externalId: organizationTable.externalId })
      .from(organizationTable)
      .where(eq(organizationTable.id, exampleDataFixture.organization.id))
    if (existingOrganization !== undefined && existingOrganization.externalId !== organizationExternalId) {
      return createResultError(
        op,
        "The configured Contentoren organization external ID conflicts with the existing organization.",
      )
    }

    if (existingOrganization === undefined) {
      const [externalOrganization] = await database
        .select({ id: organizationTable.id })
        .from(organizationTable)
        .where(eq(organizationTable.externalId, organizationExternalId))
      if (externalOrganization !== undefined) {
        return createResultError(
          op,
          "The configured Contentoren organization external ID belongs to another organization.",
        )
      }
    }

    await database
      .insert(organizationTable)
      .values({
        id: exampleDataFixture.organization.id,
        externalId: organizationExternalId,
        name: exampleDataFixture.organization.name,
        createdAt: date(exampleDataFixture.organization.createdAt),
        updatedAt: date(exampleDataFixture.organization.updatedAt),
      })
      .onConflictDoUpdate({
        target: organizationTable.id,
        set: {
          name: exampleDataFixture.organization.name,
          createdAt: date(exampleDataFixture.organization.createdAt),
          updatedAt: date(exampleDataFixture.organization.updatedAt),
        },
      })
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The Contentoren organization could not be reconciled.")
  }
}

async function exampleDataRowsReconcile(
  database: DatabaseExecutor,
  catalog: ProviderCatalog,
  userId?: string,
  organizationMembershipIssuer?: string,
  organizationMembershipSubject?: string,
  projectRootDirs?: readonly string[],
  reset?: boolean,
): Promise<Result<{ sessionCount: number; messageCount: number }>> {
  const op = "exampleDataRowsReconcile"
  const hasConfiguredProjectRoots = projectRootDirs !== undefined && projectRootDirs.length > 0
  const fixtureUser = userId === undefined ? exampleDataFixture.user : { ...exampleDataFixture.user, id: userId }
  const membershipIssuer = organizationMembershipIssuer ?? exampleDataFixture.organizationMembership.issuer
  const membershipSubject = organizationMembershipSubject ?? exampleDataFixture.organizationMembership.subject
  const catalogConfigurations = providerAgentCatalogConfigurationCompile(catalog)
  if (!catalogConfigurations.success) return createResultError(op, catalogConfigurations.errorMessage)

  try {
    const [user] = await database
      .insert(applicationUserTable)
      .values({
        id: fixtureUser.id,
        displayName: fixtureUser.displayName,
        email: fixtureUser.email,
        createdAt: date(fixtureUser.createdAt),
        updatedAt: date(fixtureUser.updatedAt),
      })
      .onConflictDoUpdate({
        target: applicationUserTable.id,
        set: {
          displayName: fixtureUser.displayName,
          email: fixtureUser.email,
          updatedAt: date(fixtureUser.updatedAt),
        },
      })
      .returning({ id: applicationUserTable.id })
    if (user?.id !== fixtureUser.id) return createResultError(op, "The example-data user has an unexpected ID.")

    const externalIdentity = await externalIdentityUpsert(database, {
      userId: fixtureUser.id,
      issuer: membershipIssuer,
      subject: membershipSubject,
    })
    if (!externalIdentity.success) return createResultError(op, externalIdentity.errorMessage)

    let configuredProjectPaths: readonly string[] = []
    if (hasConfiguredProjectRoots) {
      const projects = await projectConfiguredRootsReconcile(database, fixtureUser.id, projectRootDirs ?? [])
      if (!projects.success) return createResultError(op, projects.errorMessage)
      configuredProjectPaths = projects.data.map((project) => project.path)
    } else {
      const projects = await exampleDataProjectsReconcile(database, fixtureUser.id)
      if (!projects.success) return createResultError(op, projects.errorMessage)
    }
    if (hasConfiguredProjectRoots) {
      await exampleDataConfiguredFixtureRowsDelete(database, fixtureUser.id, configuredProjectPaths)
    } else if (reset === true || !(await exampleDataRunRowsAlreadySeeded(database, fixtureUser.id))) {
      await exampleDataOwnedRunRowsDelete(database)
    }
    if (userId !== undefined && userId !== exampleDataFixture.user.id) await exampleDataHistoryRowsDelete(database)

    await database
      .insert(organizationMemberTable)
      .values({
        organizationId: exampleDataFixture.organization.id,
        userId: fixtureUser.id,
        issuer: membershipIssuer,
        subject: membershipSubject,
        createdAt: date(exampleDataFixture.organizationMembership.createdAt),
        updatedAt: date(exampleDataFixture.organizationMembership.updatedAt),
      })
      .onConflictDoUpdate({
        target: [organizationMemberTable.organizationId, organizationMemberTable.userId],
        set: {
          issuer: membershipIssuer,
          subject: membershipSubject,
          createdAt: date(exampleDataFixture.organizationMembership.createdAt),
          updatedAt: date(exampleDataFixture.organizationMembership.updatedAt),
        },
      })

    for (const server of exampleDataFixture.servers) {
      await database
        .insert(serverTable)
        .values({
          id: server.id,
          organizationId: server.organizationId,
          name: server.name,
          endpoint: server.endpoint,
          metadata: server.metadata,
          createdAt: date(server.createdAt),
          updatedAt: date(server.updatedAt),
        })
        .onConflictDoUpdate({
          target: serverTable.id,
          set: {
            organizationId: server.organizationId,
            name: server.name,
            endpoint: server.endpoint,
            metadata: server.metadata,
            createdAt: date(server.createdAt),
            updatedAt: date(server.updatedAt),
          },
        })
    }

    for (const agent of exampleDataFixture.agents) {
      await database
        .insert(agentTable)
        .values({
          id: agent.id,
          serverId: agent.serverId,
          name: agent.name,
          role: agent.role,
          configuration: agent.configuration,
          sortOrder: agent.sortOrder,
          createdAt: date(agent.createdAt),
          updatedAt: date(agent.updatedAt),
        })
        .onConflictDoUpdate({
          target: agentTable.id,
          set: {
            serverId: agent.serverId,
            name: agent.name,
            role: agent.role,
            configuration: agent.configuration,
            sortOrder: agent.sortOrder,
            createdAt: date(agent.createdAt),
            updatedAt: date(agent.updatedAt),
          },
        })
    }

    if (!hasConfiguredProjectRoots) {
      for (const fixtureSession of exampleDataFixture.sessions) {
        await database
          .insert(sessionTable)
          .values({
            id: fixtureSession.id,
            userId: fixtureUser.id,
            serverId: fixtureSession.serverId,
            primaryAgentId: fixtureSession.primaryAgentId,
            projectPath: fixtureSession.projectPath,
            parentSessionId: fixtureSession.parentSessionId,
            title: fixtureSession.title,
            clientRequestId: fixtureSession.clientRequestId,
            metadata: fixtureSession.metadata,
            archivedAt: fixtureSession.archivedAt === null ? null : date(fixtureSession.archivedAt),
            createdAt: date(fixtureSession.createdAt),
            updatedAt: date(fixtureSession.updatedAt),
            pinned: fixtureSession.pinned,
          })
          .onConflictDoUpdate({
            target: sessionTable.id,
            set: {
              userId: fixtureUser.id,
              serverId: fixtureSession.serverId,
              primaryAgentId: fixtureSession.primaryAgentId,
              projectPath: fixtureSession.projectPath,
              parentSessionId: fixtureSession.parentSessionId,
              title: fixtureSession.title,
              clientRequestId: fixtureSession.clientRequestId,
              metadata: fixtureSession.metadata,
              archivedAt: fixtureSession.archivedAt === null ? null : date(fixtureSession.archivedAt),
              createdAt: date(fixtureSession.createdAt),
              updatedAt: date(fixtureSession.updatedAt),
              pinned: fixtureSession.pinned,
            },
          })

        for (const fixtureMessage of fixtureSession.messages) {
          await database
            .insert(messageTable)
            .values({
              id: fixtureMessage.id,
              sessionId: fixtureSession.id,
              agentId: fixtureSession.primaryAgentId,
              role: fixtureMessage.role,
              sequence: fixtureMessage.sequence,
              content: fixtureMessage.content,
              clientRequestId: fixtureMessage.clientRequestId,
              metadata: fixtureMessage.metadata,
              finalizedAt: date(fixtureMessage.finalizedAt),
              createdAt: date(fixtureMessage.createdAt),
            })
            .onConflictDoUpdate({
              target: messageTable.id,
              set: {
                sessionId: fixtureSession.id,
                agentId: fixtureSession.primaryAgentId,
                role: fixtureMessage.role,
                sequence: fixtureMessage.sequence,
                content: fixtureMessage.content,
                clientRequestId: fixtureMessage.clientRequestId,
                metadata: fixtureMessage.metadata,
                finalizedAt: date(fixtureMessage.finalizedAt),
                createdAt: date(fixtureMessage.createdAt),
              },
            })
          const historyMessage = messageApiRecordCreate({
            agentId: fixtureSession.primaryAgentId,
            clientRequestId: fixtureMessage.clientRequestId,
            content: fixtureMessage.content,
            createdAt: fixtureMessage.createdAt,
            finalizedAt: fixtureMessage.finalizedAt,
            id: fixtureMessage.id,
            metadata: fixtureMessage.metadata,
            role: fixtureMessage.role,
            sequence: fixtureMessage.sequence,
            sessionId: fixtureSession.id,
          })
          if (!historyMessage.success) return createResultError(op, historyMessage.errorMessage)
          const historyEntry = await sessionHistoryEntryRepositoryUpsert(database, fixtureUser.id, fixtureSession.id, {
            id: fixtureMessage.id,
            kind: "message",
            payload: historyMessage.data,
            sourceId: fixtureMessage.id,
            sourceType: "message",
          })
          if (!historyEntry.success) return createResultError(op, historyEntry.errorMessage)
        }
      }

      const runs = await exampleDataRunsReconcile(database, fixtureUser.id)
      if (!runs.success) return createResultError(op, runs.errorMessage)
      const sessionViews = await exampleDataSessionViewsReconcile(database, fixtureUser.id)
      if (!sessionViews.success) return createResultError(op, sessionViews.errorMessage)
    }

    const catalogAgents = [...catalogConfigurations.data].sort((left, right) => {
      const leftMode = catalogAgentMode(left.configuration) === "primary" ? 0 : 1
      const rightMode = catalogAgentMode(right.configuration) === "primary" ? 0 : 1
      return leftMode - rightMode || left.agent.id.localeCompare(right.agent.id)
    })
    for (const catalogAgent of catalogAgents) {
      const sortOrder = catalogConfigurations.data.findIndex(({ agent }) => agent.id === catalogAgent.agent.id)
      const mode = catalogAgentMode(catalogAgent.configuration)
      const timestamp = `2026-08-12T09:${String(sortOrder).padStart(2, "0")}:00.000Z`
      await database
        .insert(agentTable)
        .values({
          configuration: catalogAgent.configuration,
          id: catalogAgent.agent.id,
          name: providerAgentCatalogAgentNameCreate(catalogAgent.agent.id),
          parentAgentId: mode === "subagent" ? "delegate" : null,
          role: mode,
          serverId: "example-server-local",
          sortOrder,
          createdAt: date(timestamp),
          updatedAt: date(timestamp),
        })
        .onConflictDoUpdate({
          target: agentTable.id,
          set: {
            configuration: catalogAgent.configuration,
            name: providerAgentCatalogAgentNameCreate(catalogAgent.agent.id),
            parentAgentId: mode === "subagent" ? "delegate" : null,
            role: mode,
            serverId: "example-server-local",
            sortOrder,
            createdAt: date(timestamp),
            updatedAt: date(timestamp),
          },
        })
    }

    return createResult({
      sessionCount: hasConfiguredProjectRoots ? 0 : exampleDataFixture.sessions.length,
      messageCount: hasConfiguredProjectRoots
        ? 0
        : exampleDataFixture.sessions.reduce((count, session) => count + session.messages.length, 0),
    })
  } catch (_error) {
    return createResultError(op, "The example data could not be reconciled.")
  }
}

export async function exampleDataSeed(
  database: DatabaseClient,
  options: {
    organizationExternalId: string
    catalog?: ProviderCatalog
    configurationStore?: ConfigurationStore
    reset?: boolean
    projectRootDirs?: readonly string[]
    userId?: string
    organizationMembershipIssuer?: string
    organizationMembershipSubject?: string
  },
): Promise<Result<{ sessionCount: number; messageCount: number }>> {
  const op = "exampleDataSeed"
  if (options.organizationExternalId.trim().length === 0)
    return createResultError(op, "The Contentoren organization external ID is required.")
  if (
    options.userId !== undefined &&
    (options.organizationMembershipIssuer === undefined || options.organizationMembershipSubject === undefined)
  )
    return createResultError(op, "A seeded SSO user ID requires both the organization membership issuer and subject.")
  const catalogResult =
    options.catalog === undefined
      ? await providerAgentCatalogLoad(resolve(dirname(fileURLToPath(import.meta.url)), "../.."))
      : createResult(options.catalog)
  if (!catalogResult.success) return createResultError(op, catalogResult.errorMessage)
  const seeded = await databaseTransactionRun(database, async (transaction) => {
    try {
      const organization = await exampleDataOrganizationReconcile(transaction, options.organizationExternalId)
      if (!organization.success) return createResultError(op, organization.errorMessage)
      if (options.reset === true) await exampleDataMessagesDelete(transaction)
      return await exampleDataRowsReconcile(
        transaction,
        catalogResult.data,
        options.userId,
        options.organizationMembershipIssuer,
        options.organizationMembershipSubject,
        options.projectRootDirs,
        options.reset,
      )
    } catch (_error) {
      return createResultError(op, "The example data seed transaction failed.")
    }
  })
  if (!seeded.success || options.configurationStore === undefined) return seeded

  const configuration = await exampleDataConfigurationReconcile(options.configurationStore, catalogResult.data)
  if (!configuration.success) return createResultError(op, configuration.errorMessage)
  return seeded
}
