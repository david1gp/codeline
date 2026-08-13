import { expect, test } from "bun:test"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { cliProxyApiAdapterCreate } from "../src/providers/runtime/cliProxyApiAdapterCreate.js"
import { cliProxyApiSettingsParse } from "../src/providers/runtime/cliProxyApiSettingsParse.js"

const validSettingsResult = cliProxyApiSettingsParse({
  apiKey: "$CLIPROXYAPI_API_KEY",
  baseUrl: "http://127.0.0.1:8080/v1",
  maxTokens: 1024,
  model: "gpt-4o",
  temperature: 0.7,
})

if (!validSettingsResult.success) {
  throw new Error("Failed to parse valid CLIProxyAPI settings for testing")
}
const validSettings = validSettingsResult.data

test("mocked CLIProxyAPI adapter streams expected chunk sequence and preserves runId and session/thread ID", async () => {
  const controller = new AbortController()
  const environment = { CLIPROXYAPI_API_KEY: "secret-key-123" }
  const adapter = cliProxyApiAdapterCreate({
    environment,
    settings: validSettings,
  })

  const chunks: StreamChunk[] = []
  for await (const chunk of adapter({
    history: [],
    prompt: "Hello CLIProxyAPI",
    runId: "run-100",
    sessionId: "session-200",
    signal: controller.signal,
  })) {
    chunks.push(chunk)
  }

  expect(chunks.length).toBe(6)
  const c0 = chunks[0]
  const c1 = chunks[1]
  const c2 = chunks[2]
  const c3 = chunks[3]
  const c4 = chunks[4]
  const c5 = chunks[5]

  expect(c0?.type).toBe(EventType.RUN_STARTED)
  if (c0?.type === EventType.RUN_STARTED) {
    expect(c0.threadId).toBe("session-200")
    expect(c0.runId).toBe("run-100")
  }

  expect(c1?.type).toBe(EventType.TEXT_MESSAGE_START)
  if (c1?.type === EventType.TEXT_MESSAGE_START) {
    expect(c1.messageId).toBe("assistant-run-100")
    expect(c1.role).toBe("assistant")
  }

  expect(c2?.type).toBe(EventType.TEXT_MESSAGE_CONTENT)
  if (c2?.type === EventType.TEXT_MESSAGE_CONTENT) {
    expect(c2.delta).toBe("[CLIProxyAPI:gpt-4o] ")
  }

  expect(c3?.type).toBe(EventType.TEXT_MESSAGE_CONTENT)
  if (c3?.type === EventType.TEXT_MESSAGE_CONTENT) {
    expect(c3.delta).toBe("Hello CLIProxyAPI")
  }

  expect(c4?.type).toBe(EventType.TEXT_MESSAGE_END)
  if (c4?.type === EventType.TEXT_MESSAGE_END) {
    expect(c4.messageId).toBe("assistant-run-100")
  }

  expect(c5?.type).toBe(EventType.RUN_FINISHED)
  if (c5?.type === EventType.RUN_FINISHED) {
    expect(c5.threadId).toBe("session-200")
    expect(c5.runId).toBe("run-100")
    expect(c5.outcome?.type).toBe("success")
  }
})

test("mocked CLIProxyAPI adapter supports custom deterministic chunks", async () => {
  const controller = new AbortController()
  const environment = { CLIPROXYAPI_API_KEY: "secret-key-123" }
  const customChunks = ["chunk-alpha ", "chunk-beta ", "chunk-gamma"]
  const adapter = cliProxyApiAdapterCreate({
    chunks: customChunks,
    environment,
    settings: validSettings,
  })

  const emittedDeltas: string[] = []
  for await (const chunk of adapter({
    history: [],
    prompt: "Test prompt",
    runId: "run-custom",
    sessionId: "session-custom",
    signal: controller.signal,
  })) {
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
      emittedDeltas.push(chunk.delta)
    }
  }

  expect(emittedDeltas).toEqual(customChunks)
})

test("secret resolution resolves $CLIPROXYAPI_API_KEY without exposing secret or reference in output", async () => {
  const controller = new AbortController()
  const secretValue = "super-secret-api-key-value-999"
  const environment = { CLIPROXYAPI_API_KEY: secretValue }
  const adapter = cliProxyApiAdapterCreate({
    environment,
    settings: validSettings,
  })

  const chunks: StreamChunk[] = []
  for await (const chunk of adapter({
    history: [],
    prompt: "Secret check",
    runId: "run-secret",
    sessionId: "session-secret",
    signal: controller.signal,
  })) {
    chunks.push(chunk)
  }

  const serialized = JSON.stringify(chunks)
  expect(serialized).not.toContain("$CLIPROXYAPI_API_KEY")
  expect(serialized).not.toContain(secretValue)

  // Missing secret test
  const missingAdapter = cliProxyApiAdapterCreate({
    environment: {},
    settings: validSettings,
  })
  const missingChunks: StreamChunk[] = []
  for await (const chunk of missingAdapter({
    history: [],
    prompt: "Secret check missing",
    runId: "run-missing",
    sessionId: "session-missing",
    signal: controller.signal,
  })) {
    missingChunks.push(chunk)
  }

  expect(missingChunks.some((c) => c.type === EventType.RUN_ERROR)).toBe(true)
  expect(missingChunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
  const missingSerialized = JSON.stringify(missingChunks)
  expect(missingSerialized).not.toContain("$CLIPROXYAPI_API_KEY")
  expect(missingSerialized).not.toContain(secretValue)
})

test("injected failure before start emits RUN_ERROR and no success terminal", async () => {
  const controller = new AbortController()
  const environment = { CLIPROXYAPI_API_KEY: "secret-key-123" }
  const adapter = cliProxyApiAdapterCreate({
    environment,
    failure: {
      code: "test_fail_early",
      failBeforeStart: true,
      message: "Early failure injected",
    },
    settings: validSettings,
  })

  const chunks: StreamChunk[] = []
  for await (const chunk of adapter({
    history: [],
    prompt: "Fail prompt",
    runId: "run-fail-early",
    sessionId: "session-fail-early",
    signal: controller.signal,
  })) {
    chunks.push(chunk)
  }

  expect(chunks.some((c) => c.type === EventType.RUN_ERROR)).toBe(true)
  expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
  const errorChunk = chunks.find((c) => c.type === EventType.RUN_ERROR)
  if (errorChunk && errorChunk.type === EventType.RUN_ERROR) {
    expect(errorChunk.code).toBe("test_fail_early")
    expect(errorChunk.message).toBe("Early failure injected")
  }
})

test("injected failure mid-stream emits RUN_ERROR and no success terminal", async () => {
  const controller = new AbortController()
  const environment = { CLIPROXYAPI_API_KEY: "secret-key-123" }
  const customChunks = ["chunk-0", "chunk-1", "chunk-2"]
  const adapter = cliProxyApiAdapterCreate({
    chunks: customChunks,
    environment,
    failure: {
      atChunkIndex: 1,
      code: "test_fail_mid",
      message: "Mid-stream failure injected",
    },
    settings: validSettings,
  })

  const chunks: StreamChunk[] = []
  for await (const chunk of adapter({
    history: [],
    prompt: "Fail prompt mid",
    runId: "run-fail-mid",
    sessionId: "session-fail-mid",
    signal: controller.signal,
  })) {
    chunks.push(chunk)
  }

  expect(chunks.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT && c.delta === "chunk-0")).toBe(true)
  expect(chunks.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT && c.delta === "chunk-1")).toBe(false)
  expect(chunks.some((c) => c.type === EventType.RUN_ERROR)).toBe(true)
  expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
})

test("abort before start produces no success terminal", async () => {
  const controller = new AbortController()
  controller.abort()

  const environment = { CLIPROXYAPI_API_KEY: "secret-key-123" }
  const adapter = cliProxyApiAdapterCreate({
    environment,
    settings: validSettings,
  })

  const chunks: StreamChunk[] = []
  for await (const chunk of adapter({
    history: [],
    prompt: "Abort prompt",
    runId: "run-abort",
    sessionId: "session-abort",
    signal: controller.signal,
  })) {
    chunks.push(chunk)
  }

  expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
})

test("abort between chunks produces no success terminal", async () => {
  const controller = new AbortController()
  const environment = { CLIPROXYAPI_API_KEY: "secret-key-123" }
  const adapter = cliProxyApiAdapterCreate({
    environment,
    settings: validSettings,
  })

  const chunks: StreamChunk[] = []
  for await (const chunk of adapter({
    history: [],
    prompt: "Abort mid prompt",
    runId: "run-abort-mid",
    sessionId: "session-abort-mid",
    signal: controller.signal,
  })) {
    chunks.push(chunk)
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
      controller.abort()
    }
  }

  expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
})

test("adapter never invokes fetch or network calls", async () => {
  const originalFetch = globalThis.fetch
  let fetchCallCount = 0
  globalThis.fetch = (() => {
    fetchCallCount += 1
    throw new Error("fetch called unexpectedly")
  }) as unknown as typeof globalThis.fetch

  try {
    const controller = new AbortController()
    const environment = { CLIPROXYAPI_API_KEY: "secret-key-123" }
    const adapter = cliProxyApiAdapterCreate({
      environment,
      settings: validSettings,
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of adapter({
      history: [],
      prompt: "No fetch test",
      runId: "run-no-fetch",
      sessionId: "session-no-fetch",
      signal: controller.signal,
    })) {
      chunks.push(chunk)
    }

    expect(fetchCallCount).toBe(0)
    expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
