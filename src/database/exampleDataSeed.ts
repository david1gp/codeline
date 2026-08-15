import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { inArray } from "drizzle-orm"
import { agentTable } from "../agents/db/agentTable.js"
import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import { applicationUserTable } from "../identity/db/applicationUserTable.js"
import { externalIdentityUpsert } from "../identity/db/externalIdentityUpsert.js"
import { messageTable } from "../message/db/messageTable.js"
import { serverTable } from "../servers/db/serverTable.js"
import { sessionTable } from "../session/db/sessionTable.js"
import type { DatabaseClient, DatabaseExecutor } from "./databaseClient.js"
import { databaseTransactionRun } from "./databaseTransactionRun.js"
import { exampleDataConfigurationReconcile } from "./exampleDataConfigurationReconcile.js"
import { exampleDataFixture } from "./exampleDataFixture.js"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { providerAgentCatalogConfigurationCompile } from "../providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../providers/catalog/providerAgentCatalogLoad.js"
import { providerAgentCatalogAgentNameCreate } from "../providers/catalog/providerAgentCatalogAgentNameCreate.js"

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

async function exampleDataRowsReconcile(
  database: DatabaseExecutor,
  catalog: ProviderCatalog,
): Promise<Result<{ sessionCount: number; messageCount: number }>> {
  const op = "exampleDataRowsReconcile"
  const fixtureUser = exampleDataFixture.user
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
    if (user?.id !== fixtureUser.id) return createResultError(op, "The local-development user has an unexpected ID.")

    const externalIdentity = await externalIdentityUpsert(database, {
      userId: fixtureUser.id,
      issuer: "urn:codeline:development",
      subject: "local-development",
    })
    if (!externalIdentity.success) return createResultError(op, externalIdentity.errorMessage)

    for (const server of exampleDataFixture.servers) {
      await database
        .insert(serverTable)
        .values({
          id: server.id,
          ownerUserId: fixtureUser.id,
          name: server.name,
          endpoint: server.endpoint,
          metadata: server.metadata,
          createdAt: date(server.createdAt),
          updatedAt: date(server.updatedAt),
        })
        .onConflictDoUpdate({
          target: serverTable.id,
          set: {
            ownerUserId: fixtureUser.id,
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
          parentSessionId: fixtureSession.parentSessionId,
          title: fixtureSession.title,
          clientRequestId: fixtureSession.clientRequestId,
          metadata: fixtureSession.metadata,
          archivedAt: fixtureSession.archivedAt === null ? null : date(fixtureSession.archivedAt),
          createdAt: date(fixtureSession.createdAt),
          updatedAt: date(fixtureSession.updatedAt),
        })
        .onConflictDoUpdate({
          target: sessionTable.id,
          set: {
            userId: fixtureUser.id,
            serverId: fixtureSession.serverId,
            primaryAgentId: fixtureSession.primaryAgentId,
            parentSessionId: fixtureSession.parentSessionId,
            title: fixtureSession.title,
            clientRequestId: fixtureSession.clientRequestId,
            metadata: fixtureSession.metadata,
            archivedAt: fixtureSession.archivedAt === null ? null : date(fixtureSession.archivedAt),
            createdAt: date(fixtureSession.createdAt),
            updatedAt: date(fixtureSession.updatedAt),
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
  options: { catalog?: ProviderCatalog; configurationStore?: ConfigurationStore; reset?: boolean } = {},
): Promise<Result<{ sessionCount: number; messageCount: number }>> {
  const op = "exampleDataSeed"
  const catalogResult =
    options.catalog === undefined
      ? await providerAgentCatalogLoad(resolve(dirname(fileURLToPath(import.meta.url)), "../.."))
      : createResult(options.catalog)
  if (!catalogResult.success) return createResultError(op, catalogResult.errorMessage)
  const seeded = await databaseTransactionRun(database, async (transaction) => {
    try {
      if (options.reset === true) await exampleDataMessagesDelete(transaction)
      return await exampleDataRowsReconcile(transaction, catalogResult.data)
    } catch (_error) {
      return createResultError(op, "The example data seed transaction failed.")
    }
  })
  if (!seeded.success || options.configurationStore === undefined) return seeded

  const configuration = await exampleDataConfigurationReconcile(options.configurationStore, catalogResult.data)
  if (!configuration.success) return createResultError(op, configuration.errorMessage)
  return seeded
}
