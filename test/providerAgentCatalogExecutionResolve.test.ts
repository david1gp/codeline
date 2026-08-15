import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { providerAgentCatalogExecutionResolve } from "../src/providers/catalog/providerAgentCatalogExecutionResolve.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"

const catalogResult = await providerAgentCatalogLoad(resolve(import.meta.dir, ".."))
if (!catalogResult.success) throw new Error(catalogResult.errorMessage)
const catalog = catalogResult.data

const legacyConfiguration = {
  apiKey: "$CODEX_LB_API_TOKEN",
  baseUrl: "https://legacy.example.test/v1",
  model: "legacy-model",
  provider: "codex-lb" as const,
}

test("resolves an exact cross-provider model override from the catalog", () => {
  const result = providerAgentCatalogExecutionResolve(catalog, "build", legacyConfiguration, {
    agentId: "build",
    model: "grok-4.5",
    provider: "cliproxyapi",
    reasoningEffort: "high",
  })

  expect(result).toMatchObject({
    success: true,
    data: {
      configuration: {
        baseUrl: "https://subs.contentoren.de/v1",
        generation: { reasoningEffort: "high" },
        model: "grok-4.5",
        provider: "cliproxyapi",
      },
      modelMetadata: { id: "grok-4.5" },
    },
  })
  if (!result.success) return
  expect(result.data.configuration).not.toHaveProperty("resolvedBearerSecret")
  expect(JSON.stringify(result)).not.toContain("contentoren.de_API_KEY=")
})

test("rejects disabled models, unsupported transports, and unavailable effort variants", () => {
  const disabled = providerAgentCatalogExecutionResolve(catalog, "build", legacyConfiguration, {
    model: "gpt-5.6-luna",
    provider: "cliproxyapi",
  })
  expect(disabled).toMatchObject({
    errorMessage: "The selected catalog model is disabled or unsupported.",
    success: false,
  })

  const unsupportedCatalog = structuredClone(catalog)
  const codex = unsupportedCatalog.providers.find(({ id }) => id === "codex-lb")
  const model = codex?.models.find(({ id }) => id === "gpt-5.6-luna")
  if (model === undefined) throw new Error("Expected the codex model")
  model.enabled = true
  model.connection.transport = "vendor/custom"
  const unsupported = providerAgentCatalogExecutionResolve(unsupportedCatalog, "build", legacyConfiguration)
  expect(unsupported).toMatchObject({
    errorMessage: "The selected catalog model is disabled or unsupported.",
    success: false,
  })

  const effort = providerAgentCatalogExecutionResolve(catalog, "build", legacyConfiguration, {
    model: "gemini-3.7-flash-high",
    provider: "cliproxyapi",
    reasoningEffort: "xhigh",
  })
  expect(effort).toMatchObject({ success: false })
})

test("uses the selected model's effort variant and preserves the Markdown prompt", () => {
  const result = providerAgentCatalogExecutionResolve(catalog, "gemini-flash", legacyConfiguration, {
    model: "gemini-3.7-flash-high",
    provider: "cliproxyapi",
    reasoningEffort: "medium",
  })

  expect(result).toMatchObject({
    success: true,
    data: {
      configuration: { generation: { reasoningEffort: "medium" }, variant: "medium" },
      prompt: expect.stringContaining("use `bun` instead of `npm`"),
    },
  })
})
