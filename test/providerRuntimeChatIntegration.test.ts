import { expect, test } from "bun:test"
import * as crypto from "node:crypto"
import * as path from "node:path"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { providerDelegationAdapterCreate } from "../src/providers/runtime/providerDelegationAdapterCreate.js"
import { providerRuntimeAdapterCreate } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { providerRuntimeAdapterResolve } from "../src/providers/runtime/providerRuntimeAdapterResolve.js"

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

function instructionSnapshot(projectRoot: string) {
  const entries = [
    [path.join("/tmp", "codeline-provider-global", "AGENTS.md"), "global provider instructions", 0, "global", "global"],
    [path.join(projectRoot, "AGENTS.md"), "root provider instructions", 1, ".", "project"],
    [path.join(projectRoot, "src", "AGENTS.md"), "src provider instructions", 2, "src", "project"],
    [path.join(projectRoot, "docs", "AGENTS.md"), "docs provider instructions", 2, "docs", "project"],
  ] as const
  return {
    snapshots: entries.map(([canonicalPath, content, precedence, scope, source]) => ({
      canonicalPath,
      content,
      digest: `sha256-${crypto.createHash("sha256").update(content, "utf8").digest("hex")}`,
      precedence,
      scope,
      size: Buffer.byteLength(content, "utf8"),
      source,
    })),
    version: 1 as const,
  }
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
    expect((requests[1]!.messages as Array<{ content: string }>)[0]?.content).toBe("inspect child")
    const secondRootMessages = requests[2]!.messages as Array<{ content: unknown; role: string }>
    expect(secondRootMessages.some((message) => message.role === "tool" && message.content === "child result")).toBe(
      true,
    )
    expect(requests[0]!.max_tokens).toBe(777)
    expect(requests[0]!.temperature).toBe(0.25)
    expect(JSON.stringify(chunks)).not.toContain(secretValue)
    expect(JSON.stringify(chunks)).not.toContain(secretReference)
  }
})

test("remote runtime injects the immutable agent prompt as the system instruction", async () => {
  let request: Record<string, unknown> | undefined
  const adapter = providerRuntimeAdapterCreate({
    configuration: providerConfiguration("cliproxyapi"),
    environment: { CLIPROXYAPI_API_KEY: secretValue },
    fetch: async (_input, init) => {
      request = JSON.parse(String(init?.body)) as Record<string, unknown>
      return textResponse("done")
    },
    systemPrompt: "Inspect the repository before changing it.",
  })

  await collect(
    adapter({
      history: [],
      prompt: "user task",
      runId: "prompt-run",
      sessionId: "prompt-session",
      signal: new AbortController().signal,
    }),
  )

  expect((request!.messages as Array<{ content: string; role: string }>)[0]).toEqual({
    content: "Inspect the repository before changing it.",
    role: "system",
  })
})

test("remote runtime composes the immutable instruction baseline and scoped delegation overlays", async () => {
  const projectRoot = path.join("/tmp", "codeline-provider-project")
  const srcDirectory = path.join(projectRoot, "src")
  const resolvedRequests: Array<Record<string, unknown>> = []
  const requests: Array<Record<string, unknown>> = []
  const configuration = providerConfiguration("cliproxyapi")
  const rawAdapter = providerRuntimeAdapterCreate({
    configuration,
    environment: { CLIPROXYAPI_API_KEY: secretValue },
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requests.push(body)
      if (body.tools === undefined)
        return textResponse(JSON.stringify({ result: "child result", workingDirectory: srcDirectory }))
      const messages = body.messages as Array<{ role: string }>
      return messages.some((message) => message.role === "tool") ? textResponse("root complete") : toolCallResponse()
    },
  })
  const instructionContext = { projectRoot, snapshot: instructionSnapshot(projectRoot) }
  const resolved = providerRuntimeAdapterResolve(configuration, {
    environment: { CLIPROXYAPI_API_KEY: secretValue },
    fetch: async (_input, init) => {
      resolvedRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return textResponse("resolved runtime")
    },
    instructionContext,
    systemPrompt: "Explicit runtime prompt",
  })

  expect(resolved.success).toBe(true)
  if (!resolved.success) return

  await collect(
    resolved.data({
      history: [],
      prompt: "resolved task",
      runId: "resolved-instruction-context-run",
      sessionId: "resolved-instruction-context-session",
      signal: new AbortController().signal,
    }),
  )
  expect((resolvedRequests[0]!.messages as Array<{ content: string; role: string }>)[0]).toEqual({
    content: "Explicit runtime prompt\n\nglobal provider instructions\n\nroot provider instructions",
    role: "system",
  })

  await collect(
    providerDelegationAdapterCreate({
      adapter: rawAdapter,
      delegateTask: async () => JSON.stringify({ result: "child result", workingDirectory: srcDirectory }),
      instructionContext,
      model: configuration.model,
      systemPrompt: "Explicit runtime prompt",
    })({
      history: [],
      prompt: "root task",
      runId: "instruction-context-run",
      sessionId: "instruction-context-session",
      signal: new AbortController().signal,
    }),
  )

  expect(requests).toHaveLength(2)
  const firstSystemPrompt = (requests[0]!.messages as Array<{ content: string; role: string }>)[0]
  expect(firstSystemPrompt).toEqual({
    content: "Explicit runtime prompt\n\nglobal provider instructions\n\nroot provider instructions",
    role: "system",
  })
  const continuationSystemPrompt = (requests[1]!.messages as Array<{ content: string; role: string }>)[0]
  expect(continuationSystemPrompt).toEqual({
    content:
      "Explicit runtime prompt\n\nglobal provider instructions\n\nroot provider instructions\n\nsrc provider instructions",
    role: "system",
  })
  expect(continuationSystemPrompt).toBeDefined()
  if (continuationSystemPrompt === undefined) return
  expect(continuationSystemPrompt.content).not.toContain("docs provider instructions")
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

test("remote runtime aborts after partial provider output without leaking late chunks", async () => {
  const encoder = new TextEncoder()

  for (const provider of ["cliproxyapi", "codex-lb"] as const) {
    const controller = new AbortController()
    let responseController: ReadableStreamDefaultController<Uint8Array> | undefined
    const partialOutput = "partial provider output"
    const lateOutput = `late provider output ${secretValue} ${secretReference}`
    const configuration = providerConfiguration(provider)
    const cancelled = providerRuntimeAdapterCreate({
      configuration,
      environment: {
        ...(provider === "cliproxyapi" ? { CLIPROXYAPI_API_KEY: secretValue } : { CODEX_LB_API_TOKEN: secretValue }),
      },
      fetch: async () => {
        const body = new ReadableStream<Uint8Array>({
          start(bodyController) {
            responseController = bodyController
            bodyController.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [{ delta: { content: partialOutput, role: "assistant" }, finish_reason: null, index: 0 }],
                  id: "partial-output",
                  model: "runtime-chat-model",
                  object: "chat.completion.chunk",
                })}\n\n`,
              ),
            )
          },
        })
        return new Response(body, { headers: { "content-type": "text/event-stream" }, status: 200 })
      },
    })

    const stream = cancelled({
      history: [],
      prompt: "abort after partial output",
      runId: `partial-output-${provider}`,
      sessionId: `partial-output-${provider}`,
      signal: controller.signal,
    })
    const iterator = stream[Symbol.asyncIterator]()
    const chunks: Array<StreamChunk> = []
    while (true) {
      const result = await iterator.next()
      if (result.done) break
      chunks.push(result.value)
      if (result.value.type === EventType.TEXT_MESSAGE_CONTENT) break
    }

    controller.abort()
    responseController!.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({
          choices: [{ delta: { content: lateOutput }, finish_reason: null, index: 0 }],
          id: "late-output",
          model: "runtime-chat-model",
          object: "chat.completion.chunk",
        })}\n\n`,
      ),
    )
    responseController!.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
          id: "late-output-finish",
          model: "runtime-chat-model",
          object: "chat.completion.chunk",
        })}\n\ndata: [DONE]\n\n`,
      ),
    )
    responseController!.close()

    while (true) {
      const result = await iterator.next()
      if (result.done) break
      chunks.push(result.value)
    }

    const errors = chunks.filter((chunk) => chunk.type === EventType.RUN_ERROR)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      code: "chat_interrupted",
      message: "The provider request was aborted.",
      type: EventType.RUN_ERROR,
    })
    expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual(
      [partialOutput],
    )
    expect(chunks.some((chunk) => chunk.type === EventType.RUN_FINISHED)).toBe(false)
    expect(JSON.stringify(chunks)).not.toContain(secretValue)
    expect(JSON.stringify(chunks)).not.toContain(secretReference)
  }
})
