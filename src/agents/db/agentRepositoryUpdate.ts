import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"
import { agentUpdateRequestSchema } from "../schema/agentUpdateRequestSchema.js"
import { agentTable } from "./agentTable.js"

export async function agentRepositoryUpdate(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
  agentId: string,
  input: unknown,
): Promise<
  Result<
    Omit<typeof agentTable.$inferSelect, "configuration"> & {
      configuration: v.InferOutput<typeof agentConfigurationSchema>
    }
  >
> {
  const op = "agentRepositoryUpdate"
  const parsedInput = v.safeParse(agentUpdateRequestSchema, input)
  if (!parsedInput.success) return createResultError(op, "The agent update input is invalid.")

  try {
    const [server] = await database
      .select({ id: serverTable.id })
      .from(serverTable)
      .where(and(eq(serverTable.id, serverId), eq(serverTable.ownerUserId, userId)))
      .limit(1)
    if (server === undefined) return createResultError(op, "The server could not be found.")

    const [existing] = await database
      .select()
      .from(agentTable)
      .where(and(eq(agentTable.id, agentId), eq(agentTable.serverId, serverId)))
      .limit(1)
    if (existing === undefined) return createResultError(op, "The agent could not be found.")

    let configuration = parsedInput.output.configuration
    if (configuration === undefined) {
      const existingConfiguration = v.safeParse(agentConfigurationSchema, existing.configuration)
      if (!existingConfiguration.success) return createResultError(op, "The agent configuration could not be loaded.")
      configuration = existingConfiguration.output
    }
    const [agent] = await database
      .update(agentTable)
      .set({
        ...(parsedInput.output.configuration === undefined ? {} : { configuration: parsedInput.output.configuration }),
        ...(parsedInput.output.name === undefined ? {} : { name: parsedInput.output.name }),
        ...(parsedInput.output.role === undefined ? {} : { role: parsedInput.output.role }),
        updatedAt: new Date(),
      })
      .where(and(eq(agentTable.id, agentId), eq(agentTable.serverId, serverId)))
      .returning()
    if (agent === undefined) return createResultError(op, "The agent could not be updated.")

    return createResult({ ...agent, configuration })
  } catch (_error) {
    return createResultError(op, "The agent could not be updated.")
  }
}
