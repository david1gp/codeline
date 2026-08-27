import * as v from "valibot"
import { commandExecutionManifestSchema } from "../../commands/schema/commandExecutionManifestSchema.js"
import { agentInstructionsResolvedSnapshotSchema } from "../../instructions/schema/agentInstructionsResolvedSnapshotSchema.js"
import { skillDescriptionCatalogSchema } from "../../skills/schema/skillDescriptionCatalogSchema.js"
import { skillSnapshotSchema } from "../../skills/schema/skillSnapshotSchema.js"
import { skillDiscoveryLimits } from "../../skills/skillDiscoveryLimits.js"
import { toolNameSchema } from "../../tools/schema/toolNameSchema.js"

const runExecutionManifestAgentIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
const runExecutionManifestDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))

const runExecutionManifestSkillResourceSchema = v.pipe(
  v.strictObject({
    descriptionCatalog: v.optional(skillDescriptionCatalogSchema),
    presetName: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
    snapshots: v.pipe(
      v.array(skillSnapshotSchema),
      v.maxLength(skillDiscoveryLimits.maximumBundles),
      v.check((snapshots) => new Set(snapshots.map(({ name }) => name)).size === snapshots.length),
    ),
    version: v.literal(1),
  }),
  v.check(({ snapshots }) =>
    snapshots.every((snapshot, index) => index === 0 || snapshots[index - 1]!.name < snapshot.name),
  ),
  v.check(
    ({ snapshots }) =>
      snapshots.reduce(
        (total, snapshot) =>
          total +
          snapshot.size +
          snapshot.resources.reduce((resourceTotal, resource) => resourceTotal + resource.size, 0),
        0,
      ) <= skillDiscoveryLimits.maximumTotalBytes,
  ),
)

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
    command: v.optional(commandExecutionManifestSchema),
    instructions: agentInstructionsResolvedSnapshotSchema,
    skills: runExecutionManifestSkillResourceSchema,
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
