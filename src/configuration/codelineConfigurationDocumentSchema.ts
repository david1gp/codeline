import * as v from "valibot"
import { agentConfigurationSchema } from "../agents/schema/agentConfigurationSchema.js"
import { agentExecutionTargetSchema } from "../agents/schema/agentExecutionTargetSchema.js"

const codelineConfigurationEntrySchema = v.strictObject({
  configuration: agentConfigurationSchema,
  target: agentExecutionTargetSchema,
})

export const codelineConfigurationDocumentSchema = v.pipe(
  v.strictObject({
    agentConfigurations: v.array(codelineConfigurationEntrySchema),
    version: v.literal(1),
  }),
  v.check((document) => {
    const targets = document.agentConfigurations.map(({ target }) => `${target.serverId}\u0000${target.agentId}`)
    return new Set(targets).size === targets.length
  }, "Agent execution targets must be unique."),
)

export type CodelineConfigurationDocument = v.InferOutput<typeof codelineConfigurationDocumentSchema>
