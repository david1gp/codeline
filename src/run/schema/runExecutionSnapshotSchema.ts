import * as v from "valibot"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { agentExecutionTargetSchema } from "../../agents/schema/agentExecutionTargetSchema.js"
import { configurationRevisionSchema } from "../../configuration/configurationRevisionSchema.js"
import { providerCatalogModelSchema } from "../../providers/schema/providerCatalogModelSchema.js"
import { runExecutionManifestSchema } from "./runExecutionManifestSchema.js"

export const runExecutionSnapshotSchema = v.strictObject({
  agentPrompt: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  catalogRevision: v.optional(v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))),
  configuration: agentConfigurationSchema,
  configurationRevision: configurationRevisionSchema,
  executionManifest: v.optional(runExecutionManifestSchema),
  modelMetadata: v.optional(providerCatalogModelSchema),
  target: agentExecutionTargetSchema,
})

export type RunExecutionSnapshot = v.InferOutput<typeof runExecutionSnapshotSchema>
