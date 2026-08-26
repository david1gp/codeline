import { expect, test } from "bun:test"
import { resolve } from "node:path"
import * as v from "valibot"
import { agentConfigurationSchema } from "../src/agents/schema/agentConfigurationSchema.js"
import { providerAgentCatalogConfigurationCompile } from "../src/providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"

const catalogResult = await providerAgentCatalogLoad(resolve(import.meta.dir, ".."))
if (!catalogResult.success) throw new Error(catalogResult.errorMessage)
const compiledResult = providerAgentCatalogConfigurationCompile(catalogResult.data)
if (!compiledResult.success) throw new Error(compiledResult.errorMessage)

test("compiles every real catalog agent with inherited defaults and variant effort", () => {
  expect(compiledResult.data).toHaveLength(11)
  const byId = new Map(compiledResult.data.map((item) => [item.agent.id, item.configuration]))

  expect(byId.get("build")).toMatchObject({
    model: "gpt-5.6-luna",
    provider: "codex-lb",
    generation: { reasoningEffort: "medium" },
    tools: { bash: false, webfetch: false },
  })
  expect(byId.get("sol-high")).toMatchObject({
    model: "gpt-5.6-sol",
    provider: "codex-lb",
    generation: { reasoningEffort: "high" },
    variant: "high",
  })
  expect(byId.get("gemini-flash")).toMatchObject({
    model: "gemini-3.7-flash-high",
    provider: "cliproxyapi",
    generation: { reasoningEffort: "medium" },
    variant: "medium",
  })
})

test("keeps rich model metadata and secret references without runtime secret values", () => {
  const configuration = compiledResult.data.find(({ agent }) => agent.id === "sol-high")?.configuration
  expect(configuration).toBeDefined()
  if (configuration === undefined) return
  if (configuration.provider === "deterministic") return

  expect(v.safeParse(agentConfigurationSchema, configuration).success).toBe(true)
  expect(configuration.apiKey).toBe("$CODEX_LB_API_TOKEN")
  expect(configuration.model).toBe("gpt-5.6-sol")
  expect(configuration.modelMetadata?.limit).toEqual({ context: 272000, output: 128000 })
  expect(configuration.modelMetadata?.cost[1]?.tier).toEqual({ type: "context", size: 200000 })
  expect(configuration.modelMetadata?.capabilities.input).toContain("image")
  expect(configuration.modelMetadata?.variants.length).toBeGreaterThan(0)
  expect(configuration.generation).not.toHaveProperty("maxTokens")
  expect(configuration.generation).not.toHaveProperty("temperature")
  expect(JSON.stringify(configuration)).not.toContain("contentoren.de_API_KEY=")
})
