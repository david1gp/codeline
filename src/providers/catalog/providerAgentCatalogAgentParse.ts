import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { parseDocument } from "yaml"
import { agentCatalogFrontmatterSchema } from "../../agents/schema/agentCatalogFrontmatterSchema.js"
import { providerGenerationSchema } from "../schema/providerGenerationSchema.js"
import type { ProviderCatalog } from "../schema/providerCatalogSchema.js"

const safeId = (value: string): string | undefined =>
  value.length > 0 && value.length <= 200 && /^(?!.*\.\.)[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?$/.test(value)
    ? value
    : undefined

export function providerAgentCatalogAgentParse(
  name: string,
  source: string,
): Result<ProviderCatalog["agents"][number]> {
  const op = "providerAgentCatalogAgentParse"
  const id = safeId(name)
  if (id === undefined) return createResultError(op, "Agent filename is invalid.")
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  if (lines[0] !== "---") return createResultError(op, "Agent Markdown requires YAML frontmatter.")
  const close = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."))
  if (close < 0) return createResultError(op, "Agent frontmatter is unterminated.")
  let metadata: unknown
  try {
    const document = parseDocument(lines.slice(1, close).join("\n"), { uniqueKeys: true })
    if (document.errors.length > 0) return createResultError(op, "Catalog YAML is invalid.")
    metadata = document.toJS({ mapAsMap: false })
  } catch {
    return createResultError(op, "Catalog YAML is invalid.")
  }
  const parsed = v.safeParse(agentCatalogFrontmatterSchema, metadata === null ? {} : metadata)
  if (!parsed.success) return createResultError(op, "Agent frontmatter is invalid.")
  const prompt = lines
    .slice(close + 1)
    .join("\n")
    .trim()
  if (prompt.length === 0) return createResultError(op, "Agent Markdown body is empty.")
  const sourceModel = parsed.output.model
  const modelParts = sourceModel?.split("/")
  const provider =
    parsed.output.provider !== undefined
      ? safeId(parsed.output.provider) === "cliproxy"
        ? "cliproxyapi"
        : safeId(parsed.output.provider)
      : modelParts?.length === 2
        ? safeId(modelParts[0] ?? "") === "cliproxy"
          ? "cliproxyapi"
          : safeId(modelParts[0] ?? "")
        : undefined
  const model = safeId(modelParts?.length === 2 ? (modelParts[1] ?? "") : (sourceModel ?? ""))
  if (parsed.output.provider !== undefined && provider === undefined)
    return createResultError(op, "Agent provider is invalid.")
  if (sourceModel !== undefined && ((modelParts?.length !== 1 && modelParts?.length !== 2) || model === undefined))
    return createResultError(op, "Agent model is invalid.")
  const variant = parsed.output.variant
  const effort = parsed.output.effort ?? variant
  const generation = parsed.output.generation
  if (generation !== undefined && !v.safeParse(providerGenerationSchema, generation).success)
    return createResultError(op, "Agent generation metadata is invalid.")
  const normalizedGeneration =
    generation ??
    (effort !== undefined && ["low", "medium", "high", "xhigh", "max"].includes(effort)
      ? { reasoningEffort: effort as "low" | "medium" | "high" | "xhigh" | "max" }
      : undefined)
  return createResult({
    ...(parsed.output.description === undefined ? {} : { description: parsed.output.description }),
    enabled: parsed.output.enabled ?? true,
    ...(parsed.output.effort === undefined ? {} : { effort: parsed.output.effort }),
    id,
    ...(parsed.output.mode === undefined ? {} : { mode: parsed.output.mode }),
    ...(model === undefined ? {} : { model }),
    ...(parsed.output.permission === undefined ? {} : { permission: parsed.output.permission }),
    prompt,
    ...(provider === undefined ? {} : { provider }),
    ...(normalizedGeneration === undefined ? {} : { generation: normalizedGeneration }),
    tools: parsed.output.tools,
    ...(variant === undefined ? {} : { variant }),
  })
}
