import * as v from "valibot"
import { providerApiAgentsResponseSchema } from "../../providers/api/providerApiAgentsResponseSchema.js"

export const projectApiAgentsResponseSchema = v.strictObject({
  agents: providerApiAgentsResponseSchema.entries.agents,
  projectAgentIds: v.array(v.string()),
})

export type ProjectApiAgentsResponse = v.InferOutput<typeof projectApiAgentsResponseSchema>
