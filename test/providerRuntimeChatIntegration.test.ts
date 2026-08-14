import { expect, test } from "bun:test"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { providerDelegationAdapterCreate } from "../src/providers/runtime/providerDelegationAdapterCreate.js"
import { providerRuntimeAdapterCreate } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"

const secretReference = "$CLIPROXYAPI_API_KEY"
const secretValue = "runtime-chat-secret-456"

function providerConfiguration(provider: "cliproxyapi" | "codex-lb") {
  return {
    apiKey: provider === "cliproxyapi" ? "$CLIPROXYAPI_API_KEY" : "$CODEX_LB_API_TOKEN",
    baseUrl: "https://provider.test/v1",
    generation: { maxTokens: 777, temperature: 0.25 },
    model: "runtime-chat-model",
    provider,
  } as const
}

function sseResponse(events: readonly Record<string, unknown>[]): Response {
  const source = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`
  return new Response(source, { headers: { "content-type": "text/event-stream" }, status: 200 })
}

function toolCallResponse(): Response {
  return sseResponse([
    {
      choices: [
        {
          delta: {
            role: "assistant",
            tool_calls: [{ function: { arguments: '{"task":"', name: "delegate_task" }, id: "call-root", index: 0 }],
          },
          finish_reason: null,
          index: 0,
        },
      ],
      id: "root-tool-1",
      model: "runtime-chat-model",
      object: "chat.completion.chunk",
    },
    {
      choices: [
        {
          delta: { tool_calls: [{ function: { arguments: 'inspect child"}' }, index: 0 }] },
          finish_reason: null,
          index: 0,
        },
      ],
      id: "root-tool-2",
      model: "runtime-chat-model",
      object: "chat.completion.chunk",
    },
    {
      choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }],
      id: "root-tool-3",
      model: "runtime-chat-model",
      object: "chat.completion.chunk",
    },
  ])
}

function textResponse(text: string): Response {
  return sseResponse([
    {
      choices: [{ delta: { content: text, role: "assistant" }, finish_reason: null, index: 0 }],
      id: "text-response",
      model: "runtime-chat-model",
      object: "chat.completion.chunk",
    },
    {
      choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
      id: "text-response-finish",
      model: "runtime-chat-model",
      object: "chat.completion.chunk",
    },
  ])
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

test("remote runtime chat delegates sequentially with durable history for both provider kinds", async () => {
  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    const requests: Array<Record<string, unknown>> = []
    const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requests.push(body)
      if (body.tools === undefined) return textResponse("child result")
      const messages = body.messages as Array<{ role: string }>
      return messages.some((message) => message.role === "tool") ? textResponse("root complete") : toolCallResponse()
    }
    const configuration = providerConfiguration(provider)
    const rawAdapter = providerRuntimeAdapterCreate({
      configuration,
      environment: {
        ...(provider === "cliproxyapi" ? { CLIPROXYAPI_API_KEY: secretValue } : { CODEX_LB_API_TOKEN: secretValue }),
      },
      fetch,
    })
    const childChunks: Array<StreamChunk> = []
    const rootAdapter = providerDelegationAdapterCreate({
      adapter: rawAdapter,
      delegateTask: async ({ signal, task }) => {
        childChunks.push(
          ...(await collect(
            rawAdapter({
              history: [],
              prompt: task,
              runId: "child-run",
              sessionId: "root-session",
              signal,
            }),
          )),
        )
        return "child result"
      },
      model: configuration.model,
    })

    const chunks = await collect(
      rootAdapter({
        history: [
          { content: "durable context", role: "user" },
          { content: "durable answer", role: "assistant" },
        ] as never,
        prompt: "root task",
        runId: "root-run",
        sessionId: "root-session",
        signal: new AbortController().signal,
      }),
    )

    expect(chunks.filter((chunk) => chunk.type === EventType.RUN_STARTED)).toHaveLength(1)
    expect(chunks.filter((chunk) => chunk.type === EventType.RUN_FINISHED)).toHaveLength(1)
    expect(chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_ARGS)).toBeDefined()
    expect(chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)).toMatchObject({
      content: "child result",
      toolCallId: "call-root",
    })
    expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).at(-1)).toMatchObject({
      delta: "root complete",
    })
    expect(childChunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(true)
    expect(requests).toHaveLength(3)

    const firstMessages = requests[0]?.messages as Array<{ content: string; role: string }>
    expect(firstMessages).toEqual([
      { content: "durable context", role: "user" },
      { content: "durable answer", role: "assistant" },
      { content: "root task", role: "user" },
    ])
    expect(requests[1]?.tools).toBeUndefined()
    expect((requests[1]?.messages as Array<{ content: string }>)[0]?.content).toBe("inspect child")
    const secondRootMessages = requests[2]?.messages as Array<{ content: unknown; role: string }>
    expect(secondRootMessages.some((message) => message.role === "tool" && message.content === "child result")).toBe(
      true,
    )
    expect(requests[0]?.max_tokens).toBe(777)
    expect(requests[0]?.temperature).toBe(0.25)
    expect(JSON.stringify(chunks)).not.toContain(secretValue)
    expect(JSON.stringify(chunks)).not.toContain(secretReference)
  }
})

test("remote runtime chat classifies failures and cancellation canonically without leaking secrets", async () => {
  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    const configuration = providerConfiguration(provider)
    const environment = {
      ...(provider === "cliproxyapi" ? { CLIPROXYAPI_API_KEY: secretValue } : { CODEX_LB_API_TOKEN: secretValue }),
    }
    const failing = providerRuntimeAdapterCreate({
      configuration,
      environment,
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: secretValue, reference: secretReference } }), { status: 429 }),
    })
    const failed = await collect(
      failing({
        history: [],
        prompt: "fail",
        runId: "failure-run",
        sessionId: "failure-session",
        signal: new AbortController().signal,
      }),
    )
    expect(failed.find((chunk) => chunk.type === EventType.RUN_ERROR)).toMatchObject({
      code: "provider_rate_limited",
      type: EventType.RUN_ERROR,
    })
    expect(failed.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(false)
    expect(JSON.stringify(failed)).not.toContain(secretValue)
    expect(JSON.stringify(failed)).not.toContain(secretReference)

    const controller = new AbortController()
    let fetchStartedResolve: () => void = () => undefined
    const fetchStarted = new Promise<void>((resolve) => {
      fetchStartedResolve = resolve
    })
    const cancelled = providerRuntimeAdapterCreate({
      configuration,
      environment,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          fetchStartedResolve()
          init?.signal?.addEventListener("abort", () => reject(new DOMException(secretValue, "AbortError")), {
            once: true,
          })
        }),
    })
    const cancelledPromise = collect(
      cancelled({
        history: [],
        prompt: "cancel",
        runId: "cancel-run",
        sessionId: "cancel-session",
        signal: controller.signal,
      }),
    )
    await fetchStarted
    controller.abort()
    const cancelledChunks = await cancelledPromise
    expect(cancelledChunks.find((chunk) => chunk.type === EventType.RUN_ERROR)).toMatchObject({
      code: "chat_interrupted",
      type: EventType.RUN_ERROR,
    })
    expect(cancelledChunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(false)
    expect(JSON.stringify(cancelledChunks)).not.toContain(secretValue)
  }
})
