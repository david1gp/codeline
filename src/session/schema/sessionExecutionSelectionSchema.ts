import * as v from "valibot"
import { agentToolDefaultsSchema } from "../../agents/schema/agentToolDefaultsSchema.js"

const sessionExecutionSelectionAgentIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

const sessionExecutionSelectionAgentSchema = v.strictObject({
  agentId: sessionExecutionSelectionAgentIdSchema,
  tools: agentToolDefaultsSchema,
})

export const sessionExecutionSelectionSchema = v.pipe(
  v.strictObject({
    tools: v.strictObject({
      primary: sessionExecutionSelectionAgentSchema,
      selectableSubagents: v.pipe(
        v.array(sessionExecutionSelectionAgentSchema),
        v.maxLength(100),
        v.check((agents) => new Set(agents.map(({ agentId }) => agentId)).size === agents.length),
      ),
    }),
    version: v.literal(1),
  }),
  v.check(({ tools }) => !tools.selectableSubagents.some(({ agentId }) => agentId === tools.primary.agentId)),
)

export type SessionExecutionSelection = v.InferOutput<typeof sessionExecutionSelectionSchema>
