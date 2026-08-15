import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"
import { agentCreateRequestSchema } from "../schema/agentCreateRequestSchema.js"
import { agentTable } from "./agentTable.js"

export async function agentRepositoryCreate(
  database: DatabaseExecutor,
  userId: string,
  serverId: string,
  input: unknown,
): Promise<
  Result<
    Omit<typeof agentTable.$inferSelect, "configuration"> & {
      configuration: v.InferOutput<typeof agentConfigurationSchema>
    }
  >
> {
  const op = "agentRepositoryCreate"
  const parsedInput = v.safeParse(agentCreateRequestSchema, input)
  if (!parsedInput.success) return createResultError(op, "The agent creation input is invalid.")

  try {
    const [server] = await database
      .select({ id: serverTable.id })
      .from(serverTable)
      .where(and(eq(serverTable.id, serverId), eq(serverTable.ownerUserId, userId)))
      .limit(1)
    if (server === undefined) return createResultError(op, "The server could not be found.")

    const [agent] = await database
      .insert(agentTable)
      .values({
        configuration: parsedInput.output.configuration,
        id: uuidv7(),
        name: parsedInput.output.name,
        role: parsedInput.output.role,
        serverId,
      })
      .returning()
    if (agent === undefined) return createResultError(op, "The agent could not be created.")

    return createResult({ ...agent, configuration: parsedInput.output.configuration })
  } catch (_error) {
    return createResultError(op, "The agent could not be created.")
  }
}
