import { createHash } from "node:crypto"
import type { ProviderCatalog } from "../schema/providerCatalogSchema.js"

type CatalogRecord = Record<string, unknown>

const record = (value: unknown): CatalogRecord | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  return value as CatalogRecord
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const input = record(value)
  if (input === undefined) return JSON.stringify(value)
  return `{${Object.keys(input)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`)
    .join(",")}}`
}

export function providerAgentCatalogRevision(catalog: Omit<ProviderCatalog, "revision">): string {
  return `sha256-${createHash("sha256")
    // Catalog credentials are references, never resolved values. Their names
    // are execution-relevant: changing the configured environment variable
    // must invalidate a cached execution configuration.
    .update(stableJson(catalog))
    .digest("hex")}`
}
