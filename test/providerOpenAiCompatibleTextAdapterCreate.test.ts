import { expect, test } from "bun:test"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { InternalLogger } from "@tanstack/ai/adapter-internals"
import { providerOpenAiCompatibleTextAdapterCreate } from "../src/providers/runtime/providerOpenAiCompatibleTextAdapterCreate.js"

type AdapterInput = Parameters<ReturnType<typeof providerOpenAiCompatibleTextAdapterCreate>["chatStream"]>[0]

const secretReference = "$CODEX_LB_API_TOKEN"
const secretValue = "provider-secret-value-123"

function testLogger(): InstanceType<typeof InternalLogger> {
  return new InternalLogger(
    { debug: () => undefined, error: () => undefined, info: () => undefined, warn: () => undefined },
    {
      agentLoop: false,
      config: false,
      errors: false,
      middleware: false,
      output: false,
      provider: false,
      request: false,
      sandbox: false,
      tools: false,
    },
  )
}

function sseResponseFromSource(source: string, chunkSize?: number): Response {
  const encoded = new TextEncoder().encode(source)
  const size = Math.max(1, chunkSize ?? Math.floor(encoded.length / 3))
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < encoded.length; offset += size) {
        controller.enqueue(encoded.slice(offset, offset + size))
      }
      controller.close()
    },
  })
  return new Response(body, { headers: { "content-type": "text/event-stream" }, status: 200 })
}

function sseResponse(events: readonly Record<string, unknown>[], chunkSize?: number): Response {
  const source = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`
  return sseResponseFromSource(source, chunkSize)
}

function streamInput(signal: AbortSignal, tools?: AdapterInput["tools"]): AdapterInput {
  return {
    logger: testLogger(),
    messages: [{ content: "tool prompt", role: "user" }],
    model: "provider-model",
    request: { signal },
    ...(tools === undefined ? {} : { tools }),
  }
}

const tool = {
  description: "Look up a value.",
  inputSchema: {
    properties: { value: { type: "number" } },
    required: ["value"],
    type: "object",
  },
  name: "lookup_value",
}

test("CLIProxyAPI and Codex-LB stream split tool-call fragments sequentially", async () => {
  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    const requests: Array<{ init?: RequestInit; input: RequestInfo | URL }> = []
    const controller = new AbortController()
    const adapter = providerOpenAiCompatibleTextAdapterCreate({
      baseUrl: "https://provider.test/v1",
      fetch: async (input, init) => {
        requests.push({ init, input })
        return sseResponse([
          {
            id: "chunk-1",
            object: "chat.completion.chunk",
            created: 1,
            choices: [
              {
                delta: {
                  role: "assistant",
                  tool_calls: [
                    {
                      function: { arguments: '{"value":', name: "lookup_value" },
                      id: "call-1",
                      index: 0,
                      type: "function",
                    },
                  ],
                },
                finish_reason: null,
                index: 0,
              },
            ],
            model: "provider-model",
          },
          {
            id: "chunk-2",
            object: "chat.completion.chunk",
            created: 1,
            choices: [
              { delta: { tool_calls: [{ function: { arguments: "7}" }, index: 0 }] }, finish_reason: null, index: 0 },
            ],
            model: "provider-model",
          },
          {
            id: "chunk-3",
            object: "chat.completion.chunk",
            created: 1,
            choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }],
            model: "provider-model",
          },
        ])
      },
      model: "provider-model",
      provider,
      resolvedBearerSecret: secretValue,
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.chatStream(streamInput(controller.signal, [tool]))) chunks.push(chunk)

    const body = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>
    const runStarted = chunks.find((chunk) => chunk.type === EventType.RUN_STARTED)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.init?.signal).toBeDefined()
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(`Bearer ${secretValue}`)
    expect(body.model).toBe("provider-model")
    expect(body.parallel_tool_calls).toBe(false)
    expect(runStarted === undefined || "parentRunId" in runStarted).toBe(false)
    expect(chunks.some((chunk) => chunk.type === EventType.TOOL_CALL_START && chunk.toolCallId === "call-1")).toBe(true)
    expect(chunks.filter((chunk) => chunk.type === EventType.TOOL_CALL_ARGS).map((chunk) => chunk.delta)).toEqual([
      '{"value":',
      "7}",
    ])
    expect(chunks.some((chunk) => chunk.type === EventType.TOOL_CALL_END && chunk.toolCallId === "call-1")).toBe(true)
    expect(chunks.at(-1)).toMatchObject({ finishReason: "tool_calls", type: EventType.RUN_FINISHED })
  }
})

test("CLIProxyAPI and Codex-LB preserve UTF-8 text across arbitrary SSE chunk boundaries", async () => {
  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    const controller = new AbortController()
    const adapter = providerOpenAiCompatibleTextAdapterCreate({
      baseUrl: "https://provider.test/v1",
      fetch: async () =>
        sseResponse(
          [
            {
              choices: [{ delta: { content: "before " }, finish_reason: null, index: 0 }],
              id: "chunk-1",
              model: "provider-model",
              object: "chat.completion.chunk",
            },
            {
              choices: [{ delta: { content: "café 🌍" }, finish_reason: null, index: 0 }],
              id: "chunk-2",
              model: "provider-model",
              object: "chat.completion.chunk",
            },
            {
              choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
              id: "chunk-3",
              model: "provider-model",
              object: "chat.completion.chunk",
            },
          ],
          1,
        ),
      model: "provider-model",
      provider,
      resolvedBearerSecret: secretValue,
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.chatStream(streamInput(controller.signal))) chunks.push(chunk)

    expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual(
      ["before ", "café 🌍"],
    )
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(false)
    expect(chunks.at(-1)).toMatchObject({ finishReason: "stop", type: EventType.RUN_FINISHED })
  }
})

test("invalid provider SSE JSON becomes a bounded canonical error", async () => {
  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    const adapter = providerOpenAiCompatibleTextAdapterCreate({
      baseUrl: "https://provider.test/v1",
      fetch: async () =>
        sseResponseFromSource(
          [
            `data: ${JSON.stringify({
              choices: [{ delta: { content: "before malformed input" }, finish_reason: null, index: 0 }],
              id: "chunk-1",
              model: "provider-model",
              object: "chat.completion.chunk",
            })}\n\n`,
            'data: {"choices":\n\n',
            `data: ${JSON.stringify({
              choices: [{ delta: { content: "after malformed input" }, finish_reason: null, index: 0 }],
              id: "chunk-2",
              model: "provider-model",
              object: "chat.completion.chunk",
            })}\n\n`,
            "data: [DONE]\n\n",
          ].join(""),
          1,
        ),
      model: "provider-model",
      provider,
      resolvedBearerSecret: secretValue,
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.chatStream(streamInput(new AbortController().signal))) chunks.push(chunk)

    expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual(
      ["before malformed input"],
    )
    const error = chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
    expect(error).toMatchObject({
      code: "provider_failed",
      message: "The provider rejected the request.",
      type: EventType.RUN_ERROR,
    })
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(false)
    expect(error && JSON.stringify(error).length).toBeLessThan(512)
  }
})

test("truncated provider terminal frame becomes a bounded canonical error", async () => {
  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    const adapter = providerOpenAiCompatibleTextAdapterCreate({
      baseUrl: "https://provider.test/v1",
      fetch: async () =>
        sseResponseFromSource(
          [
            `data: ${JSON.stringify({
              choices: [{ delta: { content: "before truncated terminal" }, finish_reason: null, index: 0 }],
              id: "chunk-1",
              model: "provider-model",
              object: "chat.completion.chunk",
            })}\n\n`,
            "data: [DON\n\n",
          ].join(""),
          1,
        ),
      model: "provider-model",
      provider,
      resolvedBearerSecret: secretValue,
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.chatStream(streamInput(new AbortController().signal))) chunks.push(chunk)

    expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual(
      ["before truncated terminal"],
    )
    const error = chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
    expect(error).toMatchObject({
      code: "provider_failed",
      message: "The provider rejected the request.",
      type: EventType.RUN_ERROR,
    })
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(false)
    expect(error && JSON.stringify(error).length).toBeLessThan(512)
  }
})

test("provider HTTP failures are canonical, classified, and redacted for both providers", async () => {
  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    for (const [status, code] of [
      [429, "provider_rate_limited"],
      [503, "provider_unavailable"],
      [400, "provider_failed"],
      [401, "provider_failed"],
    ] as const) {
      let fetchCalls = 0
      const adapter = providerOpenAiCompatibleTextAdapterCreate({
        baseUrl: "https://provider.test/v1",
        fetch: async () => {
          fetchCalls += 1
          return new Response(JSON.stringify({ error: { message: secretValue, reference: secretReference } }), {
            status,
          })
        },
        model: "provider-model",
        provider,
        resolvedBearerSecret: secretValue,
      })
      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream(streamInput(new AbortController().signal))) chunks.push(chunk)

      const error = chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
      expect(fetchCalls).toBe(1)
      expect(error).toMatchObject({ code, message: expect.any(String), type: EventType.RUN_ERROR })
      expect(error && "rawEvent" in error).toBe(false)
      expect(JSON.stringify(error)).not.toContain(secretReference)
      expect(JSON.stringify(error)).not.toContain(secretValue)
    }
  }
})

test("provider aborts are canonical and redacted for both providers", async () => {
  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    const controller = new AbortController()
    const adapter = providerOpenAiCompatibleTextAdapterCreate({
      baseUrl: "https://provider.test/v1",
      fetch: async (_input, init) => {
        expect(init?.signal).toBeDefined()
        controller.abort()
        throw new DOMException(secretValue, "AbortError")
      },
      model: "provider-model",
      provider,
      resolvedBearerSecret: secretValue,
    })
    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.chatStream(streamInput(controller.signal))) chunks.push(chunk)

    const error = chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
    expect(error).toMatchObject({ code: "chat_interrupted", message: expect.any(String), type: EventType.RUN_ERROR })
    expect(JSON.stringify(error)).not.toContain(secretReference)
    expect(JSON.stringify(error)).not.toContain(secretValue)
  }
})
