import * as v from "valibot"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"

const agentFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const agentListResponseV2Schema = v.strictObject({
  agents: v.array(
    v.strictObject({
      id: agentFieldSchema,
      name: agentFieldSchema,
      parentAgentId: v.nullable(agentFieldSchema),
      role: agentFieldSchema,
      serverId: agentFieldSchema,
    }),
  ),
  etag: apiEtagSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
})

export type AgentListResponseV2 = v.InferOutput<typeof agentListResponseV2Schema>
