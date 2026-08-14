import * as v from "valibot"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { agentExecutionTargetSchema } from "../../agents/schema/agentExecutionTargetSchema.js"
import { configurationRevisionSchema } from "../../configuration/configurationRevisionSchema.js"

export const runExecutionSnapshotSchema = v.strictObject({
  configuration: agentConfigurationSchema,
  configurationRevision: configurationRevisionSchema,
  target: agentExecutionTargetSchema,
})

export type RunExecutionSnapshot = v.InferOutput<typeof runExecutionSnapshotSchema>
