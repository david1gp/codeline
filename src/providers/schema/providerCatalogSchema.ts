import * as v from "valibot"
import { agentCatalogPermissionSchema } from "../../agents/schema/agentCatalogPermissionSchema.js"
import { providerGenerationSchema } from "./providerGenerationSchema.js"

const catalogIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^(?!.*\.\.)[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?$/),
)
const catalogValueSchema = v.unknown()
const environmentReferencePattern = /^\$[A-Z][A-Z0-9_]{0,127}$/

const providerOptionValueCredentialsValid = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.every(providerOptionValueCredentialsValid)
  if (typeof value !== "object" || value === null) return true
  for (const [key, item] of Object.entries(value)) {
    if (
      (key === "apiKey" || key === "api_key") &&
      (typeof item !== "string" || !environmentReferencePattern.test(item))
    )
      return false
    if (!providerOptionValueCredentialsValid(item)) return false
  }
  return true
}

const providerOptionsCredentialsValid = (value: Record<string, unknown>): boolean =>
  providerOptionValueCredentialsValid(value)

const providerOptionsSchema = v.pipe(
  v.record(v.string(), catalogValueSchema),
  v.check(providerOptionsCredentialsValid, "Option credentials must be environment references."),
)
const modalitySchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))
const effortSchema = v.picklist(["minimal", "low", "medium", "high", "xhigh", "max"])
const httpUrlSchema = v.pipe(
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
const costValueSchema = v.pipe(v.number(), v.finite(), v.minValue(0))

const providerCatalogEndpointSchema = v.strictObject({
  type: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  url: v.optional(httpUrlSchema),
})

const providerCatalogConnectionSchema = v.strictObject({
  apiKey: v.optional(v.pipe(v.string(), v.regex(/^\$[A-Z][A-Z0-9_]{0,127}$/))),
  baseUrl: v.optional(httpUrlSchema),
  endpoint: providerCatalogEndpointSchema,
  env: v.array(v.pipe(v.string(), v.regex(/^\$[A-Z][A-Z0-9_]{0,127}$/))),
  options: providerOptionsSchema,
  provider: catalogIdSchema,
  transport: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
})

const providerCatalogCostTierSchema = v.strictObject({
  cache: v.strictObject({
    read: costValueSchema,
    write: costValueSchema,
  }),
  input: costValueSchema,
  output: costValueSchema,
  tier: v.optional(
    v.strictObject({
      size: v.pipe(v.number(), v.integer(), v.minValue(1)),
      type: v.literal("context"),
    }),
  ),
})

const providerCatalogCapabilitiesSchema = v.strictObject({
  input: v.array(modalitySchema),
  output: v.array(modalitySchema),
  tools: v.boolean(),
})

const providerCatalogLimitSchema = v.strictObject({
  context: v.pipe(v.number(), v.integer(), v.minValue(0)),
  input: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  output: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

const providerCatalogVariantSchema = v.strictObject({
  effort: v.optional(effortSchema),
  id: catalogIdSchema,
  options: providerOptionsSchema,
})

const providerCatalogModelSchema = v.strictObject({
  capabilities: providerCatalogCapabilitiesSchema,
  connection: providerCatalogConnectionSchema,
  cost: v.array(providerCatalogCostTierSchema),
  enabled: v.boolean(),
  family: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  id: catalogIdSchema,
  limit: providerCatalogLimitSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  options: providerOptionsSchema,
  providerId: catalogIdSchema,
  reasoning: v.boolean(),
  status: v.picklist(["alpha", "beta", "deprecated", "active"]),
  variants: v.array(providerCatalogVariantSchema),
})

const providerCatalogProviderSchema = v.strictObject({
  connection: providerCatalogConnectionSchema,
  enabled: v.boolean(),
  id: catalogIdSchema,
  models: v.array(providerCatalogModelSchema),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
})

export const providerCatalogSchema = v.strictObject({
  agents: v.array(
    v.strictObject({
      description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2_000))),
      enabled: v.boolean(),
      effort: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80))),
      id: catalogIdSchema,
      mode: v.optional(v.picklist(["primary", "subagent"])),
      model: v.optional(catalogIdSchema),
      permission: v.optional(agentCatalogPermissionSchema),
      prompt: v.pipe(v.string(), v.trim(), v.minLength(1)),
      provider: v.optional(catalogIdSchema),
      generation: v.optional(providerGenerationSchema),
      variant: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80))),
    }),
  ),
  providers: v.array(providerCatalogProviderSchema),
  revision: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
})

export type ProviderCatalog = v.InferOutput<typeof providerCatalogSchema>
