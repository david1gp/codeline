import * as v from "valibot"
import { providerGenerationSchema } from "../../providers/schema/providerGenerationSchema.js"
import { providerCatalogModelSchema } from "../../providers/schema/providerCatalogModelSchema.js"
import { secretReferenceSchema } from "../../providers/schema/secretReferenceSchema.js"

const agentModelSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
const providerBaseUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.url(),
  v.check((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0
    )
  }),
)

const cliProxyApiSecretReferenceSchema = v.pipe(
  secretReferenceSchema,
  v.check((value) => value === "$CLIPROXYAPI_API_KEY" || value === "$SUBS_CONTENTOREN_DE_API_KEY"),
)

const codexLbSecretReferenceSchema = v.pipe(
  secretReferenceSchema,
  v.check((value) => value === "$CODEX_LB_API_TOKEN"),
)

const catalogAgentMetadataSchema = v.strictObject({
  description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2_000))),
  enabled: v.boolean(),
  id: agentModelSchema,
  mode: v.picklist(["primary", "subagent"]),
})

const catalogOptionsSchema = v.record(v.string(), v.unknown())

const deterministicAgentConfigurationSchema = v.strictObject({
  provider: v.literal("deterministic"),
  model: agentModelSchema,
  generation: v.optional(providerGenerationSchema),
})

const cliproxyapiAgentConfigurationSchema = v.strictObject({
  provider: v.literal("cliproxyapi"),
  model: agentModelSchema,
  baseUrl: providerBaseUrlSchema,
  apiKey: cliProxyApiSecretReferenceSchema,
  catalogAgent: v.optional(catalogAgentMetadataSchema),
  catalogRevision: v.optional(v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))),
  generation: v.optional(providerGenerationSchema),
  modelMetadata: v.optional(providerCatalogModelSchema),
  modelOptions: v.optional(catalogOptionsSchema),
  providerOptions: v.optional(catalogOptionsSchema),
  variant: v.optional(agentModelSchema),
})

const codexLbAgentConfigurationSchema = v.strictObject({
  provider: v.literal("codex-lb"),
  model: agentModelSchema,
  baseUrl: providerBaseUrlSchema,
  apiKey: codexLbSecretReferenceSchema,
  catalogAgent: v.optional(catalogAgentMetadataSchema),
  catalogRevision: v.optional(v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))),
  generation: v.optional(providerGenerationSchema),
  modelMetadata: v.optional(providerCatalogModelSchema),
  modelOptions: v.optional(catalogOptionsSchema),
  providerOptions: v.optional(catalogOptionsSchema),
  variant: v.optional(agentModelSchema),
})

export const agentConfigurationSchema = v.variant("provider", [
  deterministicAgentConfigurationSchema,
  cliproxyapiAgentConfigurationSchema,
  codexLbAgentConfigurationSchema,
])

export type AgentConfiguration = v.InferOutput<typeof agentConfigurationSchema>
