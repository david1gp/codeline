import * as v from "valibot"
import { toolNameSchema } from "../../tools/schema/toolNameSchema.js"

const sessionExecutionResourceSummaryDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))
const sessionExecutionResourceSummaryRelativePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => {
    if (value === ".") return true
    if (value.startsWith("/") || value.includes("\\")) return false
    return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  }),
)
const sessionExecutionResourceSummaryCanonicalPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)),
)
const sessionExecutionResourceSummaryNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)
const sessionExecutionResourceSummarySizeSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)

const sessionExecutionResourceSummarySkillResourceSchema = v.strictObject({
  digest: sessionExecutionResourceSummaryDigestSchema,
  path: sessionExecutionResourceSummaryRelativePathSchema,
  size: sessionExecutionResourceSummarySizeSchema,
})

const sessionExecutionResourceSummarySkillSchema = v.strictObject({
  bundleDigest: sessionExecutionResourceSummaryDigestSchema,
  bundlePath: sessionExecutionResourceSummaryRelativePathSchema,
  description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000)),
  digest: sessionExecutionResourceSummaryDigestSchema,
  name: sessionExecutionResourceSummaryNameSchema,
  precedence: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.check((value) => Number.isSafeInteger(value)),
  ),
  resources: v.array(sessionExecutionResourceSummarySkillResourceSchema),
  size: sessionExecutionResourceSummarySizeSchema,
  source: v.picklist(["global", "project"]),
})

const sessionExecutionResourceSummaryInstructionSourceSchema = v.strictObject({
  canonicalPath: v.optional(sessionExecutionResourceSummaryCanonicalPathSchema),
  content: v.optional(v.string()),
  digest: sessionExecutionResourceSummaryDigestSchema,
  path: sessionExecutionResourceSummaryRelativePathSchema,
  precedence: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.check((value) => Number.isSafeInteger(value)),
  ),
  scope: sessionExecutionResourceSummaryRelativePathSchema,
  size: sessionExecutionResourceSummarySizeSchema,
  source: v.picklist(["global", "project"]),
  validation: v.literal("valid"),
})

const sessionExecutionResourceSummaryAgentToolsSchema = v.strictObject({
  agentId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  tools: v.pipe(
    v.array(toolNameSchema),
    v.maxLength(4),
    v.check((tools) => new Set(tools).size === tools.length),
  ),
})

const sessionExecutionResourceSummaryDescriptionCatalogSchema = v.strictObject({
  characterCount: sessionExecutionResourceSummarySizeSchema,
  estimatedTokens: sessionExecutionResourceSummarySizeSchema,
  estimatedTokensIsEstimate: v.literal(true),
  skills: v.array(
    v.strictObject({
      bundlePath: sessionExecutionResourceSummaryRelativePathSchema,
      description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000)),
      name: sessionExecutionResourceSummaryNameSchema,
    }),
  ),
  version: v.literal(1),
})

export const sessionExecutionResourceSummarySchema = v.pipe(
  v.strictObject({
    descriptionCatalog: v.nullable(sessionExecutionResourceSummaryDescriptionCatalogSchema),
    instructionSources: v.array(sessionExecutionResourceSummaryInstructionSourceSchema),
    presetName: v.nullable(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
    skills: v.array(sessionExecutionResourceSummarySkillSchema),
    tools: v.strictObject({
      primary: sessionExecutionResourceSummaryAgentToolsSchema,
      selectableSubagents: v.pipe(
        v.array(sessionExecutionResourceSummaryAgentToolsSchema),
        v.maxLength(100),
        v.check((agents) => new Set(agents.map(({ agentId }) => agentId)).size === agents.length),
      ),
    }),
    version: v.literal(1),
  }),
  v.check(({ tools }) => !tools.selectableSubagents.some(({ agentId }) => agentId === tools.primary.agentId)),
)

export type SessionExecutionResourceSummary = v.InferOutput<typeof sessionExecutionResourceSummarySchema>
