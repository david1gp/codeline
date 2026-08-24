import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { EventType } from "@tanstack/ai"
import { providerAgentCatalogConfigurationCompile } from "../src/providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { providerRuntimeAdapterCreate } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"

const input = {
  history: [],
  prompt: "runtime prompt",
  runId: "run-runtime",
  sessionId: "session-runtime",
  signal: new AbortController().signal,
}

const catalogResult = await providerAgentCatalogLoad(resolve(import.meta.dir, ".."))
if (!catalogResult.success) throw new Error(catalogResult.errorMessage)
const compiledCatalogResult = providerAgentCatalogConfigurationCompile(catalogResult.data)
if (!compiledCatalogResult.success) throw new Error(compiledCatalogResult.errorMessage)

async function runtimeRequestCapture(
  configuration: Parameters<typeof providerRuntimeAdapterCreate>[0]["configuration"],
) {
  const requests: Array<{ init?: RequestInit; input: RequestInfo | URL }> = []
  const adapter = providerRuntimeAdapterCreate({
    configuration,
    environment: {
      CLIPROXYAPI_API_KEY: "cliproxy-secret",
      CODEX_LB_API_TOKEN: "codex-secret",
      SUBS_CONTENTOREN_DE_API_KEY: "cliproxy-secret",
    },
    fetch: async (requestInput, init) => {
      requests.push({ init, input: requestInput })
      return new Response(JSON.stringify({ error: { message: "request rejected" } }), { status: 400 })
    },
  })
  const chunks = []
  for await (const chunk of adapter(input)) chunks.push(chunk)
  const request = requests[0]
  if (request === undefined) throw new Error("The provider request was not captured.")
  return { body: JSON.parse(String(request.init?.body)) as Record<string, unknown>, chunks, request }
}

test("provider runtime factory selects the deterministic adapter", async () => {
  const adapter = providerRuntimeAdapterCreate({
    configuration: { provider: "deterministic", model: "test-model" },
    environment: {},
  })
  const chunks = []
  for await (const chunk of adapter(input)) chunks.push(chunk)

  expect(chunks.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ])
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "Deterministic response: ",
    "runtime prompt",
  ])
})

test("provider runtime factory selects CLIProxyAPI and Codex-LB adapters", async () => {
  for (const [provider, apiKey, label] of [
    ["cliproxyapi", "$CLIPROXYAPI_API_KEY", "CLIProxyAPI"],
    ["codex-lb", "$CODEX_LB_API_TOKEN", "Codex-LB"],
  ] as const) {
    const adapter = providerRuntimeAdapterCreate({
      configuration: {
        apiKey,
        baseUrl: "https://provider.test/v1",
        model: "provider-model",
        provider,
      },
      environment: {
        [apiKey.slice(1)]: "secret-value",
      },
    })
    const chunks = []
    for await (const chunk of adapter(input)) chunks.push(chunk)

    expect(chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(true)
    expect(chunks.find((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)?.delta).toBe(
      `[${label}:provider-model] `,
    )
  }
})

test("credentialed provider runtime adapters report unavailable secrets", async () => {
  const adapter = providerRuntimeAdapterCreate({
    configuration: {
      apiKey: "$CODEX_LB_API_TOKEN",
      baseUrl: "https://provider.test/v1",
      model: "provider-model",
      provider: "codex-lb",
    },
    environment: {},
  })
  const chunks = []
  for await (const chunk of adapter(input)) chunks.push(chunk)

  expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(true)
  expect(chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(false)
})

test("catalog Codex-LB Responses models map provider options into the Responses payload", async () => {
  const configuration = compiledCatalogResult.data.find(({ agent }) => agent.id === "sol-high")?.configuration
  if (configuration === undefined) throw new Error("Expected the catalog sol-high configuration")

  const captured = await runtimeRequestCapture(configuration)
  expect(String(captured.request.input)).toBe("https://codex.contentoren.de/v1/responses")
  expect(captured.body).toMatchObject({
    include: ["reasoning.encrypted_content"],
    model: "gpt-5.6-sol",
    reasoning: { effort: "high", summary: "detailed" },
    store: false,
    text: { verbosity: "low" },
  })
  expect(captured.body).not.toHaveProperty("npm")
  expect(captured.body).not.toHaveProperty("blacklist")
  expect(captured.body).not.toHaveProperty("max_tokens")
  expect(captured.body).not.toHaveProperty("max_output_tokens")
  expect(captured.body).not.toHaveProperty("temperature")
})

test("catalog CLIProxyAPI completion models retain the compatible payload without catalog metadata", async () => {
  const configuration = compiledCatalogResult.data.find(({ agent }) => agent.id === "gemini-flash")?.configuration
  if (configuration === undefined) throw new Error("Expected the catalog Gemini configuration")

  const captured = await runtimeRequestCapture(configuration)
  expect(String(captured.request.input)).toBe("https://subs.contentoren.de/v1/chat/completions")
  expect(captured.body).toMatchObject({ model: "gemini-3.7-flash-high", reasoning_effort: "medium" })
  expect(captured.body).not.toHaveProperty("npm")
  expect(captured.body).not.toHaveProperty("blacklist")
  expect(captured.body).not.toHaveProperty("max_tokens")
  expect(captured.body).not.toHaveProperty("temperature")
  expect(captured.body).not.toHaveProperty("reasoning")
})

test("deterministic provider runtime adapters preserve injected failure behavior", async () => {
  const adapter = providerRuntimeAdapterCreate({
    chunks: ["chunk-0", "chunk-1"],
    configuration: { model: "test-model", provider: "deterministic" },
    environment: {},
    failure: { atChunkIndex: 1, code: "test_runtime_failure", message: "Runtime failure injected" },
  })
  const chunks = []
  for await (const chunk of adapter(input)) chunks.push(chunk)

  expect(chunks.some((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT && chunk.delta === "chunk-0")).toBe(true)
  expect(chunks.some((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT && chunk.delta === "chunk-1")).toBe(false)
  expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(true)
  expect(chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(false)
})
