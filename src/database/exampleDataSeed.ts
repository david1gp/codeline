import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq, inArray } from "drizzle-orm"
import type { DatabaseClient, DatabaseExecutor } from "./databaseClient.js"
import { databaseTransactionRun } from "./databaseTransactionRun.js"
import { exampleDataFixture } from "./exampleDataFixture.js"
import { agentTable } from "../agents/db/agentTable.js"
import { developmentUserTable } from "../identity/db/developmentUserTable.js"
import { messageTable } from "../message/db/messageTable.js"
import { serverTable } from "../servers/db/serverTable.js"
import { sessionTable } from "../session/db/sessionTable.js"

function date(value: string): Date {
  return new Date(value)
}

async function exampleDataRowsDelete(database: DatabaseExecutor): Promise<void> {
  const sessionIds = exampleDataFixture.sessions.map((session) => session.id)
  const messageIds = exampleDataFixture.sessions.flatMap((session) => session.messages.map((message) => message.id))

  await database.delete(messageTable).where(inArray(messageTable.id, messageIds))
  await database.delete(sessionTable).where(inArray(sessionTable.id, sessionIds))
  await database.delete(agentTable).where(eq(agentTable.id, exampleDataFixture.agent.id))
  await database.delete(serverTable).where(eq(serverTable.id, exampleDataFixture.server.id))
}

async function exampleDataRowsReconcile(
  database: DatabaseExecutor,
): Promise<Result<{ sessionCount: number; messageCount: number }>> {
  const op = "exampleDataRowsReconcile"
  const fixtureUser = exampleDataFixture.user

  try {
    const [user] = await database
      .insert(developmentUserTable)
      .values({
        id: fixtureUser.id,
        identityKey: fixtureUser.identityKey,
        displayName: fixtureUser.displayName,
        email: fixtureUser.email,
        createdAt: date(fixtureUser.createdAt),
        updatedAt: date(fixtureUser.updatedAt),
      })
      .onConflictDoUpdate({
        target: developmentUserTable.identityKey,
        set: {
          displayName: fixtureUser.displayName,
          email: fixtureUser.email,
          updatedAt: date(fixtureUser.updatedAt),
        },
      })
      .returning({ id: developmentUserTable.id })
    if (user?.id !== fixtureUser.id) return createResultError(op, "The local-development user has an unexpected ID.")

    const server = exampleDataFixture.server
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

    const agent = exampleDataFixture.agent
    await database
      .insert(agentTable)
      .values({
        id: agent.id,
        serverId: server.id,
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
          serverId: server.id,
          name: agent.name,
          role: agent.role,
          configuration: agent.configuration,
          sortOrder: agent.sortOrder,
          createdAt: date(agent.createdAt),
          updatedAt: date(agent.updatedAt),
        },
      })

    for (const fixtureSession of exampleDataFixture.sessions) {
      await database
        .insert(sessionTable)
        .values({
          id: fixtureSession.id,
          userId: fixtureUser.id,
          serverId: server.id,
          primaryAgentId: agent.id,
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
            serverId: server.id,
            primaryAgentId: agent.id,
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
            agentId: agent.id,
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
              agentId: agent.id,
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
  options: { reset: boolean } = { reset: false },
): Promise<Result<{ sessionCount: number; messageCount: number }>> {
  const op = "exampleDataSeed"
  return databaseTransactionRun(database, async (transaction) => {
    try {
      if (options.reset) await exampleDataRowsDelete(transaction)
      return await exampleDataRowsReconcile(transaction)
    } catch (_error) {
      return createResultError(op, "The example data seed transaction failed.")
    }
  })
}
