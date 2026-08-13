import { expect, test } from "bun:test"
import { EventType } from "@tanstack/ai"
import { providerRuntimeAdapterCreate } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"

const input = {
  history: [],
  prompt: "runtime prompt",
  runId: "run-runtime",
  sessionId: "session-runtime",
  signal: new AbortController().signal,
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
