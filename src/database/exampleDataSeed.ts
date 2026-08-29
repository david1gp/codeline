import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq, inArray } from "drizzle-orm"
import { agentTable } from "../agents/db/agentTable.js"
import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import { applicationUserTable } from "../identity/db/applicationUserTable.js"
import { externalIdentityUpsert } from "../identity/db/externalIdentityUpsert.js"
import { organizationMemberTable } from "../identity/db/organizationMemberTable.js"
import { organizationTable } from "../identity/db/organizationTable.js"
import { messageTable } from "../message/db/messageTable.js"
import { attemptTable } from "../run/db/attemptTable.js"
import { runTable } from "../run/db/runTable.js"
import { providerAgentCatalogAgentNameCreate } from "../providers/catalog/providerAgentCatalogAgentNameCreate.js"
import { providerAgentCatalogConfigurationCompile } from "../providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../providers/catalog/providerAgentCatalogLoad.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { serverTable } from "../servers/db/serverTable.js"
import { sessionTable } from "../session/db/sessionTable.js"
import { sessionViewTable } from "../session/db/sessionViewTable.js"
import { projectFolderBootstrapEnsure } from "../project/db/projectFolderBootstrapEnsure.js"
import { projectFolderBootstrapIdLoad } from "../project/db/projectFolderBootstrapIdLoad.js"
import { projectTable } from "../project/db/projectTable.js"
import type { DatabaseClient, DatabaseExecutor } from "./databaseClient.js"
import { databaseTransactionRun } from "./databaseTransactionRun.js"
import { exampleDataConfigurationReconcile } from "./exampleDataConfigurationReconcile.js"
import { exampleDataFixture } from "./exampleDataFixture.js"
import { uuidv7 } from "../uuid/uuidv7.js"

function date(value: string): Date {
  return new Date(value)
}

function catalogAgentMode(configuration: AgentConfiguration): "primary" | "subagent" {
  if (configuration.provider === "deterministic") return "subagent"
  return configuration.catalogAgent?.mode ?? "subagent"
}

async function exampleDataMessagesDelete(database: DatabaseExecutor): Promise<void> {
  const messageIds = exampleDataFixture.sessions.flatMap((session) => session.messages.map((message) => message.id))

  await database.delete(messageTable).where(inArray(messageTable.id, messageIds))
}

async function exampleDataOwnedRunRowsDelete(database: DatabaseExecutor): Promise<void> {
  const runIds = exampleDataFixture.runs.map((run) => run.id)
  const sessionIds = exampleDataFixture.sessionViews.map((sessionView) => sessionView.sessionId)

  await database.delete(runTable).where(inArray(runTable.id, runIds))
  await database.delete(sessionViewTable).where(inArray(sessionViewTable.sessionId, sessionIds))
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

async function exampleDataRunsReconcile(database: DatabaseExecutor, userId: string): Promise<Result<void>> {
  const op = "exampleDataRunsReconcile"

  try {
    for (const fixtureRun of exampleDataFixture.runs) {
      await database
        .insert(runTable)
        .values({
          budget: fixtureRun.budget,
          clientRunId: fixtureRun.clientRunId,
          createdAt: date(fixtureRun.createdAt),
          deadlineAt: date(fixtureRun.deadlineAt),
          failure: fixtureRun.failure,
          finishedAt: fixtureRun.finishedAt === null ? null : date(fixtureRun.finishedAt),
          id: fixtureRun.id,
          sessionId: fixtureRun.sessionId,
          snapshot: fixtureRun.snapshot,
          startedAt: date(fixtureRun.startedAt),
          status: fixtureRun.status,
          streamId: fixtureRun.streamId,
          updatedAt: date(fixtureRun.updatedAt),
          userId,
        })
        .onConflictDoUpdate({
          target: runTable.id,
          set: {
            budget: fixtureRun.budget,
            clientRunId: fixtureRun.clientRunId,
            createdAt: date(fixtureRun.createdAt),
            deadlineAt: date(fixtureRun.deadlineAt),
            failure: fixtureRun.failure,
            finishedAt: fixtureRun.finishedAt === null ? null : date(fixtureRun.finishedAt),
            sessionId: fixtureRun.sessionId,
            snapshot: fixtureRun.snapshot,
            startedAt: date(fixtureRun.startedAt),
            status: fixtureRun.status,
            streamId: fixtureRun.streamId,
            updatedAt: date(fixtureRun.updatedAt),
            userId,
          },
        })
    }

    for (const fixtureAttempt of exampleDataFixture.attempts) {
      await database
        .insert(attemptTable)
        .values({
          budget: fixtureAttempt.budget,
          createdAt: date(fixtureAttempt.createdAt),
          failure: fixtureAttempt.failure,
          finishedAt: fixtureAttempt.finishedAt === null ? null : date(fixtureAttempt.finishedAt),
          id: fixtureAttempt.id,
          ordinal: fixtureAttempt.ordinal,
          runId: fixtureAttempt.runId,
          sessionId: fixtureAttempt.sessionId,
          snapshot: fixtureAttempt.snapshot,
          startedAt: date(fixtureAttempt.startedAt),
          status: fixtureAttempt.status,
          streamId: fixtureAttempt.streamId,
          updatedAt: date(fixtureAttempt.updatedAt),
          userId,
        })
        .onConflictDoUpdate({
          target: attemptTable.id,
          set: {
            budget: fixtureAttempt.budget,
            createdAt: date(fixtureAttempt.createdAt),
            failure: fixtureAttempt.failure,
            finishedAt: fixtureAttempt.finishedAt === null ? null : date(fixtureAttempt.finishedAt),
            ordinal: fixtureAttempt.ordinal,
            runId: fixtureAttempt.runId,
            sessionId: fixtureAttempt.sessionId,
            snapshot: fixtureAttempt.snapshot,
            startedAt: date(fixtureAttempt.startedAt),
            status: fixtureAttempt.status,
            streamId: fixtureAttempt.streamId,
            updatedAt: date(fixtureAttempt.updatedAt),
            userId,
          },
        })
    }

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
): Promise<Result<{ sessionCount: number; messageCount: number }>> {
  const op = "exampleDataRowsReconcile"
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

    const projects = await exampleDataProjectsReconcile(database, fixtureUser.id)
    if (!projects.success) return createResultError(op, projects.errorMessage)
    await exampleDataOwnedRunRowsDelete(database)

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
      }
    }

    const runs = await exampleDataRunsReconcile(database, fixtureUser.id)
    if (!runs.success) return createResultError(op, runs.errorMessage)
    const sessionViews = await exampleDataSessionViewsReconcile(database, fixtureUser.id)
    if (!sessionViews.success) return createResultError(op, sessionViews.errorMessage)

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
      sessionCount: exampleDataFixture.sessions.length,
      messageCount: exampleDataFixture.sessions.reduce((count, session) => count + session.messages.length, 0),
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
