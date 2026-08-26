import * as v from "valibot"
import { toolNameSchema } from "../../tools/schema/toolNameSchema.js"

const runExecutionManifestAgentIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
const runExecutionManifestDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))

const runExecutionManifestEmptyResourceSchema = v.strictObject({
  snapshots: v.array(v.never()),
  version: v.literal(1),
})

const runExecutionManifestAgentSchema = v.strictObject({
  agentId: runExecutionManifestAgentIdSchema,
  tools: v.pipe(
    v.array(toolNameSchema),
    v.maxLength(4),
    v.check((tools) => new Set(tools).size === tools.length),
  ),
})

export const runExecutionManifestSchema = v.pipe(
  v.strictObject({
    commandCatalog: v.strictObject({
      digest: v.nullable(runExecutionManifestDigestSchema),
      version: v.literal(1),
    }),
    instructions: runExecutionManifestEmptyResourceSchema,
    skills: runExecutionManifestEmptyResourceSchema,
    tools: v.strictObject({
      primary: runExecutionManifestAgentSchema,
      selectableSubagents: v.pipe(
        v.array(runExecutionManifestAgentSchema),
        v.maxLength(100),
        v.check((agents) => new Set(agents.map(({ agentId }) => agentId)).size === agents.length),
      ),
    }),
    version: v.literal(1),
  }),
  v.check(({ tools }) => !tools.selectableSubagents.some(({ agentId }) => agentId === tools.primary.agentId)),
)

export type RunExecutionManifest = v.InferOutput<typeof runExecutionManifestSchema>
