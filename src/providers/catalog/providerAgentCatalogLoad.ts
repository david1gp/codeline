import { readdir, readFile } from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { parseDocument } from "yaml"
import {
  type AgentCatalogFrontmatter,
  agentCatalogFrontmatterSchema,
} from "../../agents/schema/agentCatalogFrontmatterSchema.js"
import { type ProviderCatalog, providerCatalogSchema } from "../schema/providerCatalogSchema.js"
import { providerGenerationSchema } from "../schema/providerGenerationSchema.js"
import { providerAgentCatalogRevision } from "./providerAgentCatalogRevision.js"

type RawRecord = Record<string, unknown>
type CatalogModel = ProviderCatalog["providers"][number]["models"][number]
type CatalogProvider = ProviderCatalog["providers"][number]
type CatalogAgent = ProviderCatalog["agents"][number]

const rawProviderSchema = v.strictObject({
  apiKey: v.optional(v.string()),
  baseUrl: v.optional(v.string()),
  capabilities: v.optional(v.record(v.string(), v.unknown())),
  cost: v.optional(v.union([v.array(v.record(v.string(), v.unknown())), v.record(v.string(), v.unknown())])),
  disabled: v.optional(v.boolean()),
  enabled: v.optional(v.boolean()),
  env: v.optional(v.array(v.string())),
  endpoint: v.optional(v.unknown()),
  family: v.optional(v.string()),
  input: v.optional(v.array(v.string())),
  limit: v.optional(v.record(v.string(), v.unknown())),
  limits: v.optional(v.record(v.string(), v.unknown())),
  modalities: v.optional(v.record(v.string(), v.unknown())),
  model: v.optional(v.string()),
  name: v.optional(v.string()),
  options: v.optional(v.record(v.string(), v.unknown())),
  output: v.optional(v.array(v.string())),
  provider: v.optional(v.string()),
  providerDisplayName: v.optional(v.string()),
  providerEnabled: v.optional(v.boolean()),
  providerName: v.optional(v.string()),
  providerOptions: v.optional(v.record(v.string(), v.unknown())),
  reasoning: v.optional(v.boolean()),
  status: v.optional(v.picklist(["alpha", "beta", "deprecated", "active"])),
  time: v.optional(v.record(v.string(), v.unknown())),
  tools: v.optional(v.boolean()),
  transport: v.optional(v.string()),
  variants: v.optional(v.array(v.record(v.string(), v.unknown()))),
})

const safeId = (value: string): string | undefined => {
  if (value.length === 0 || value.length > 200) return undefined
  if (!/^(?!.*\.\.)[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?$/.test(value)) return undefined
  return value
}

const providerIdNormalize = (value: string): string | undefined => {
  const id = safeId(value)
  if (id === "cliproxy") return "cliproxyapi"
  return id
}

const record = (value: unknown): RawRecord | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  return value as RawRecord
}

const finiteNonNegative = (value: unknown, fallback = 0): number | undefined => {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined
  return value
}

const nonNegativeInteger = (value: unknown, fallback = 0): number | undefined => {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return undefined
  return value
}

const stringValue = (value: unknown, fallback: string): string | undefined => {
  if (value === undefined) return fallback
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) return undefined
  return value.trim()
}

const secretReference = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  const reference = trimmed.startsWith("$") ? trimmed : `$${trimmed}`
  return /^\$[A-Z][A-Z0-9_]{0,127}$/.test(reference) ? reference : undefined
}

const jsonValue = (value: unknown): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(jsonValue)
  const object = record(value)
  return object !== undefined && Object.entries(object).every(([key, item]) => key.length > 0 && jsonValue(item))
}

const optionsNormalize = (value: unknown): RawRecord | undefined => {
  const options = record(value) ?? {}
  if (!jsonValue(options)) return undefined

  // Credentials have dedicated catalog fields (`apiKey` and `env`). Do not
  // infer secrets from arbitrary option names; only the explicit aliases are
  // accepted here, and they must still be environment references.
  const normalizeValue = (item: unknown): unknown => {
    if (Array.isArray(item)) {
      const normalized = item.map(normalizeValue)
      return normalized.some((entry) => entry === undefined) ? undefined : normalized
    }
    const object = record(item)
    if (object === undefined) return item
    const normalized: RawRecord = {}
    for (const [key, nested] of Object.entries(object)) {
      if (key === "apiKey" || key === "api_key") {
        const reference = secretReference(nested)
        if (reference === undefined) return undefined
        normalized[key] = reference
        continue
      }
      const normalizedValue = normalizeValue(nested)
      if (normalizedValue === undefined) return undefined
      normalized[key] = normalizedValue
    }
    return normalized
  }

  return normalizeValue(options) as RawRecord | undefined
}

const urlNormalize = (value: unknown): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !URL.canParse(value)) return undefined
  const url = new URL(value)
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return undefined
  }
  return url.toString().replace(/\/$/, "")
}

const endpointNormalize = (
  value: unknown,
  transport: string,
  baseUrl: string | undefined,
): { type: string; url?: string } | undefined => {
  if (value === undefined) return baseUrl === undefined ? { type: transport } : { type: transport, url: baseUrl }
  if (typeof value === "string") return { type: value.trim(), ...(baseUrl === undefined ? {} : { url: baseUrl }) }
  const input = record(value)
  if (input === undefined || typeof input.type !== "string") return undefined
  const url = urlNormalize(input.url ?? baseUrl)
  if (input.url !== undefined && url === undefined) return undefined
  return { type: input.type.trim(), ...(url === undefined ? {} : { url }) }
}

const supportedTransports = new Set(["openai/completions", "openai/responses"])
const supportedAgentEfforts = new Set(["low", "medium", "high", "xhigh", "max"])

const costNormalize = (value: unknown): CatalogModel["cost"] | undefined => {
  const entries = value === undefined ? [] : Array.isArray(value) ? value : [value]
  const output: CatalogModel["cost"] = []
  for (const entryValue of entries) {
    const entry = record(entryValue)
    if (entry === undefined) return undefined
    const cache = record(entry.cache)
    const input = finiteNonNegative(entry.input)
    const outputCost = finiteNonNegative(entry.output)
    const cacheRead = finiteNonNegative(entry.cacheRead ?? cache?.read)
    const cacheWrite = finiteNonNegative(entry.cacheWrite ?? cache?.write)
    if (input === undefined || outputCost === undefined || cacheRead === undefined || cacheWrite === undefined)
      return undefined
    const tierRecord = record(entry.tier)
    let tier: { type: "context"; size: number } | undefined
    if (tierRecord !== undefined) {
      if (tierRecord.type !== "context") return undefined
      const size = nonNegativeInteger(tierRecord.size, -1)
      if (size === undefined || size < 1) return undefined
      tier = { type: "context", size }
    }
    output.push({
      cache: { read: cacheRead, write: cacheWrite },
      input,
      output: outputCost,
      ...(tier === undefined ? {} : { tier }),
    })
  }
  return output.sort((a, b) => (a.tier?.size ?? 0) - (b.tier?.size ?? 0))
}

const capabilitiesNormalize = (raw: RawRecord): CatalogModel["capabilities"] | undefined => {
  const source = record(raw.capabilities) ?? record(raw.modalities) ?? {}
  const input = source.input ?? raw.input ?? []
  const output = source.output ?? raw.output ?? []
  if (
    !Array.isArray(input) ||
    !Array.isArray(output) ||
    !input.every((item) => typeof item === "string") ||
    !output.every((item) => typeof item === "string")
  )
    return undefined
  const tools = source.tools ?? raw.tools ?? false
  if (typeof tools !== "boolean") return undefined
  return {
    input: [...new Set(input.map((item) => item.trim()).filter((item) => item.length > 0))].sort(),
    output: [...new Set(output.map((item) => item.trim()).filter((item) => item.length > 0))].sort(),
    tools,
  }
}

const variantsNormalize = (value: unknown): CatalogModel["variants"] | undefined => {
  if (value === undefined) return []
  if (!Array.isArray(value)) return undefined
  const variants: CatalogModel["variants"] = []
  for (const valueItem of value) {
    const input = record(valueItem)
    if (input === undefined || typeof input.id !== "string") return undefined
    const id = safeId(input.id)
    if (id === undefined || variants.some((variant) => variant.id === id)) return undefined
    const effort = input.effort ?? input.reasoningEffort
    if (effort !== undefined && !["minimal", "low", "medium", "high", "xhigh", "max"].includes(String(effort)))
      return undefined
    const options = { ...input }
    delete options.id
    delete options.effort
    delete options.reasoningEffort
    const normalizedOptions = optionsNormalize(options)
    if (normalizedOptions === undefined) return undefined
    variants.push({
      id,
      options: normalizedOptions,
      ...(effort === undefined ? {} : { effort: effort as "minimal" | "low" | "medium" | "high" | "xhigh" | "max" }),
    })
  }
  return variants.sort((a, b) => a.id.localeCompare(b.id))
}

const yamlParse = (source: string): Result<unknown> => {
  const op = "providerAgentCatalogLoad"
  try {
    const document = parseDocument(source, { uniqueKeys: true })
    if (document.errors.length > 0) return createResultError(op, "Catalog YAML is invalid.")
    return createResult(document.toJS({ mapAsMap: false }))
  } catch {
    return createResultError(op, "Catalog YAML is invalid.")
  }
}

const providerModelParse = (
  providerName: string,
  modelName: string,
  source: string,
): Result<{ model: CatalogModel; providerDisplayName: string; providerEnabled: boolean }> => {
  const op = "providerAgentCatalogLoad"
  const yaml = yamlParse(source)
  if (!yaml.success) return yaml
  const parsed = v.safeParse(rawProviderSchema, yaml.data)
  if (!parsed.success) return createResultError(op, "Provider model metadata is invalid.")
  const raw = parsed.output
  const providerId = providerIdNormalize(providerName)
  const modelId = safeId(modelName)
  if (providerId === undefined || modelId === undefined)
    return createResultError(op, "Provider or model filename is invalid.")
  if (raw.provider !== undefined && providerIdNormalize(raw.provider) !== providerId)
    return createResultError(op, "Provider metadata does not match its directory.")
  if (raw.model !== undefined && raw.model !== modelId)
    return createResultError(op, "Model metadata does not match its filename.")
  const baseUrl = urlNormalize(raw.baseUrl)
  if (raw.baseUrl !== undefined && baseUrl === undefined) return createResultError(op, "Provider base URL is invalid.")
  const apiKey = raw.apiKey === undefined ? undefined : secretReference(raw.apiKey)
  if (raw.apiKey !== undefined && apiKey === undefined)
    return createResultError(op, "Provider credentials must be environment references.")
  const envValues = raw.env ?? []
  const env: string[] = []
  for (const value of envValues) {
    const reference = secretReference(value)
    if (reference === undefined)
      return createResultError(op, "Provider environment entries must be environment references.")
    if (!env.includes(reference)) env.push(reference)
  }
  const transport = stringValue(raw.transport, "unknown")
  if (transport === undefined) return createResultError(op, "Provider transport is invalid.")
  const endpoint = endpointNormalize(raw.endpoint, transport, baseUrl)
  if (endpoint === undefined || endpoint.type.length === 0)
    return createResultError(op, "Provider endpoint is invalid.")
  const connectionOptions = optionsNormalize(raw.providerOptions ?? {})
  const providerDisplayNameValue =
    raw.providerDisplayName === undefined ? undefined : stringValue(raw.providerDisplayName, "")
  const providerNameValue = raw.providerName === undefined ? undefined : stringValue(raw.providerName, "")
  if (
    (raw.providerDisplayName !== undefined && providerDisplayNameValue === undefined) ||
    (raw.providerName !== undefined && providerNameValue === undefined)
  )
    return createResultError(op, "Provider display metadata is invalid.")
  if (
    providerDisplayNameValue !== undefined &&
    providerNameValue !== undefined &&
    providerDisplayNameValue !== providerNameValue
  )
    return createResultError(op, "Provider display metadata conflicts.")
  const providerDisplayName = providerDisplayNameValue ?? providerNameValue ?? providerId
  if (providerDisplayName === undefined) return createResultError(op, "Provider display metadata is invalid.")
  const options = optionsNormalize(raw.options ?? {})
  if (connectionOptions === undefined || options === undefined)
    return createResultError(op, "Provider options are invalid.")
  const capabilities = capabilitiesNormalize(raw)
  const cost = costNormalize(raw.cost)
  const limitRaw = record(raw.limit ?? raw.limits) ?? {}
  const context = nonNegativeInteger(limitRaw.context)
  const limitInput = limitRaw.input === undefined ? undefined : nonNegativeInteger(limitRaw.input)
  const limitOutput = nonNegativeInteger(limitRaw.output)
  if (capabilities === undefined || cost === undefined || context === undefined || limitOutput === undefined)
    return createResultError(op, "Provider model metadata limits or costs are invalid.")
  const variants = variantsNormalize(raw.variants)
  if (variants === undefined) return createResultError(op, "Provider model effort variants are invalid.")
  const name = stringValue(raw.name, modelId)
  if (name === undefined) return createResultError(op, "Provider model identity is invalid.")
  const enabled = !(raw.disabled === true || raw.enabled === false || !supportedTransports.has(transport))
  const model: CatalogModel = {
    capabilities,
    connection: {
      ...(apiKey === undefined ? {} : { apiKey }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
      endpoint,
      env: env.sort(),
      options: connectionOptions,
      provider: providerId,
      transport,
    },
    cost,
    enabled,
    ...(raw.family === undefined ? {} : { family: raw.family.trim() }),
    id: modelId,
    limit: { context, ...(limitInput === undefined ? {} : { input: limitInput }), output: limitOutput },
    name,
    options,
    providerId,
    reasoning: raw.reasoning ?? variants.some((variant) => variant.effort !== undefined),
    status: raw.status ?? "active",
    variants,
  }
  const providerEnabled = raw.providerEnabled ?? true
  return createResult({ model, providerDisplayName, providerEnabled })
}

const frontmatterParse = (source: string): Result<{ metadata: AgentCatalogFrontmatter; prompt: string }> => {
  const op = "providerAgentCatalogLoad"
  const normalized = source.replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  if (lines[0] !== "---") return createResultError(op, "Agent Markdown requires YAML frontmatter.")
  const close = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."))
  if (close < 0) return createResultError(op, "Agent frontmatter is unterminated.")
  const yaml = yamlParse(lines.slice(1, close).join("\n"))
  if (!yaml.success) return yaml
  const parsed = v.safeParse(agentCatalogFrontmatterSchema, yaml.data === null ? {} : yaml.data)
  if (!parsed.success) return createResultError(op, "Agent frontmatter is invalid.")
  const prompt = lines
    .slice(close + 1)
    .join("\n")
    .trim()
  if (prompt.length === 0) return createResultError(op, "Agent Markdown body is empty.")
  return createResult({ metadata: parsed.output, prompt })
}

const agentParse = (name: string, source: string): Result<CatalogAgent> => {
  const op = "providerAgentCatalogLoad"
  const id = safeId(name)
  if (id === undefined) return createResultError(op, "Agent filename is invalid.")
  const parsed = frontmatterParse(source)
  if (!parsed.success) return parsed
  const sourceModel = parsed.data.metadata.model
  const modelParts = sourceModel?.split("/")
  const provider =
    parsed.data.metadata.provider !== undefined
      ? providerIdNormalize(parsed.data.metadata.provider)
      : modelParts?.length === 2
        ? providerIdNormalize(modelParts[0] ?? "")
        : undefined
  const model = safeId(modelParts?.length === 2 ? (modelParts[1] ?? "") : (sourceModel ?? ""))
  if (parsed.data.metadata.provider !== undefined && provider === undefined)
    return createResultError(op, "Agent provider is invalid.")
  if (sourceModel !== undefined && ((modelParts?.length !== 1 && modelParts?.length !== 2) || model === undefined))
    return createResultError(op, "Agent model is invalid.")
  const variant = parsed.data.metadata.variant
  const effort = parsed.data.metadata.effort ?? variant
  const generation = parsed.data.metadata.generation
  if (generation !== undefined && !v.safeParse(providerGenerationSchema, generation).success)
    return createResultError(op, "Agent generation metadata is invalid.")
  const normalizedGeneration =
    generation ??
    (effort !== undefined && supportedAgentEfforts.has(effort)
      ? { reasoningEffort: effort as "low" | "medium" | "high" | "xhigh" | "max" }
      : undefined)
  return createResult({
    ...(parsed.data.metadata.description === undefined ? {} : { description: parsed.data.metadata.description }),
    enabled: parsed.data.metadata.enabled ?? true,
    ...(parsed.data.metadata.effort === undefined ? {} : { effort: parsed.data.metadata.effort }),
    id,
    ...(parsed.data.metadata.mode === undefined ? {} : { mode: parsed.data.metadata.mode }),
    ...(model === undefined ? {} : { model }),
    ...(parsed.data.metadata.permission === undefined ? {} : { permission: parsed.data.metadata.permission }),
    prompt: parsed.data.prompt,
    ...(provider === undefined ? {} : { provider }),
    ...(normalizedGeneration === undefined ? {} : { generation: normalizedGeneration }),
    ...(variant === undefined ? {} : { variant }),
  })
}

const directoryEntriesRead = async (directory: string, extension: string): Promise<Result<string[]>> => {
  const op = "providerAgentCatalogLoad"
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    if (entries.some((entry) => !entry.isFile() || !entry.name.endsWith(extension)))
      return createResultError(op, "The provider and agent catalog has an invalid layout.")
    return createResult(entries.map((entry) => entry.name).sort())
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return createResult([])
    return createResultError(op, "The provider and agent catalog could not be read.")
  }
}

const connectionFingerprint = (provider: CatalogProvider["connection"]): string => {
  const stable = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
    const input = record(value)
    if (input === undefined) return JSON.stringify(value)
    return `{${Object.keys(input)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(input[key])}`)
      .join(",")}}`
  }
  return stable(provider)
}

export async function providerAgentCatalogLoad(rootDirectory: string): Promise<Result<ProviderCatalog>> {
  const op = "providerAgentCatalogLoad"
  const providersDirectory = path.join(rootDirectory, "providers")
  const agentsDirectory = path.join(rootDirectory, "agents")
  let providerDirectories: string[]
  try {
    const entries = await readdir(providersDirectory, { withFileTypes: true })
    if (entries.some((entry) => !entry.isDirectory()))
      return createResultError(op, "The provider and agent catalog has an invalid layout.")
    providerDirectories = entries.map((entry) => entry.name).sort()
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") providerDirectories = []
    else return createResultError(op, "The provider and agent catalog could not be read.")
  }
  const providers: CatalogProvider[] = []
  const providerIds = new Set<string>()
  for (const providerDirectory of providerDirectories) {
    const providerId = providerIdNormalize(providerDirectory)
    if (providerId === undefined || providerIds.has(providerId))
      return createResultError(op, "Provider IDs are invalid or duplicated.")
    providerIds.add(providerId)
    const files = await directoryEntriesRead(path.join(providersDirectory, providerDirectory), ".yml")
    if (!files.success) return files
    const models: CatalogModel[] = []
    const modelIds = new Set<string>()
    let providerConnection: CatalogModel["connection"] | undefined
    let providerDisplayName: string | undefined
    let providerEnabled = true
    for (const file of files.data) {
      const modelId = safeId(file.slice(0, -4))
      if (modelId === undefined || modelIds.has(modelId))
        return createResultError(op, "Model IDs are invalid or duplicated.")
      modelIds.add(modelId)
      let source: string
      try {
        source = await readFile(path.join(providersDirectory, providerDirectory, file), "utf8")
      } catch {
        return createResultError(op, "A provider model file could not be read.")
      }
      const parsed = providerModelParse(providerDirectory, file.slice(0, -4), source)
      if (!parsed.success) return parsed
      if (providerConnection === undefined) providerConnection = parsed.data.model.connection
      if (connectionFingerprint(providerConnection) !== connectionFingerprint(parsed.data.model.connection))
        return createResultError(op, "Provider model files disagree on connection settings.")
      if (providerDisplayName === undefined) providerDisplayName = parsed.data.providerDisplayName
      if (providerDisplayName !== parsed.data.providerDisplayName)
        return createResultError(op, "Provider model files disagree on display metadata.")
      if (models.length === 0) providerEnabled = parsed.data.providerEnabled
      if (providerEnabled !== parsed.data.providerEnabled)
        return createResultError(op, "Provider model files disagree on enabled state.")
      models.push(parsed.data.model)
    }
    if (providerConnection === undefined || providerDisplayName === undefined)
      return createResultError(op, "Provider directories must contain model files.")
    providers.push({
      connection: providerConnection,
      enabled: providerEnabled,
      id: providerId,
      models: models.sort((a, b) => a.id.localeCompare(b.id)),
      name: providerDisplayName,
    })
  }
  const agentFiles = await directoryEntriesRead(agentsDirectory, ".md")
  if (!agentFiles.success) return agentFiles
  const agents: CatalogAgent[] = []
  const agentIds = new Set<string>()
  for (const file of agentFiles.data) {
    const id = safeId(file.slice(0, -3))
    if (id === undefined || agentIds.has(id)) return createResultError(op, "Agent IDs are invalid or duplicated.")
    agentIds.add(id)
    let source: string
    try {
      source = await readFile(path.join(agentsDirectory, file), "utf8")
    } catch {
      return createResultError(op, "An agent file could not be read.")
    }
    const parsed = agentParse(file.slice(0, -3), source)
    if (!parsed.success) return parsed
    agents.push(parsed.data)
  }
  const withoutRevision = {
    agents: agents.sort((a, b) => a.id.localeCompare(b.id)),
    providers: providers.sort((a, b) => a.id.localeCompare(b.id)),
  }
  const revision = providerAgentCatalogRevision(withoutRevision)
  const catalog = { ...withoutRevision, revision }
  const validated = v.safeParse(providerCatalogSchema, catalog)
  if (!validated.success) return createResultError(op, "The provider and agent catalog is invalid.")
  return createResult(validated.output)
}
