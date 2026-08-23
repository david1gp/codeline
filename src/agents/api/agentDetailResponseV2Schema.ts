import * as v from "valibot"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"

const agentFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const agentDetailResponseV2Schema = v.strictObject({
  agent: v.strictObject({
    configuration: agentConfigurationSchema,
    id: agentFieldSchema,
    name: agentFieldSchema,
    role: agentFieldSchema,
    serverId: agentFieldSchema,
  }),
  etag: apiEtagSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
})

export type AgentDetailResponseV2 = v.InferOutput<typeof agentDetailResponseV2Schema>
