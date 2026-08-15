import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"
import { agentTable } from "./agentTable.js"

export async function agentRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
  agentId: string,
): Promise<
  Result<{
    agent: Omit<typeof agentTable.$inferSelect, "configuration"> & {
      configuration: v.InferOutput<typeof agentConfigurationSchema>
    }
    server: typeof serverTable.$inferSelect
  }>
> {
  const op = "agentRepositoryLoad"

  try {
    const [row] = await database
      .select({ agent: agentTable, server: serverTable })
      .from(agentTable)
      .innerJoin(serverTable, and(eq(agentTable.serverId, serverTable.id), eq(serverTable.ownerUserId, userId)))
      .where(and(eq(agentTable.serverId, serverId), eq(agentTable.id, agentId)))
      .limit(1)
    if (row === undefined) return createResultError(op, "The agent could not be found.")

    const parsedConfiguration = v.safeParse(agentConfigurationSchema, row.agent.configuration)
    if (!parsedConfiguration.success) return createResultError(op, "The agent configuration could not be loaded.")

    return createResult({
      agent: { ...row.agent, configuration: parsedConfiguration.output },
      server: row.server,
    })
  } catch (_error) {
    return createResultError(op, "The agent could not be loaded.")
  }
}
