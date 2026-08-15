import { EventType, type StreamChunk } from "@tanstack/ai"
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible"

type ProviderLabel = "cliproxyapi" | "codex-lb"
type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type ProviderFailureCode =
  | "chat_interrupted"
  | "provider_connection_failed"
  | "provider_failed"
  | "provider_rate_limited"
  | "provider_unavailable"

export type ProviderOpenAiCompatibleTextAdapterOptions = {
  baseUrl: string
  fetch: ProviderFetch
  model: string
  provider: ProviderLabel
  resolvedBearerSecret: string
  transport?: "openai/completions" | "openai/responses"
}

type OpenAiCompatibleTextAdapter = ReturnType<typeof openaiCompatibleText>
type ProviderTextOptions = Parameters<OpenAiCompatibleTextAdapter["chatStream"]>[0]

const providerFailureMessages: Record<ProviderFailureCode, string> = {
  chat_interrupted: "The provider request was aborted.",
  provider_connection_failed: "The provider connection failed.",
  provider_failed: "The provider rejected the request.",
  provider_rate_limited: "The provider rate limit was exceeded.",
  provider_unavailable: "The provider is unavailable.",
}

function providerFailureErrorCreate(code: ProviderFailureCode): Error & { code: ProviderFailureCode } {
  const error = new Error(providerFailureMessages[code]) as Error & { code: ProviderFailureCode }
  Object.defineProperty(error, "code", { enumerable: true, value: code })
  return error
}

function providerFailureCodeFromStatus(status: number): ProviderFailureCode {
  if (status === 429) return "provider_rate_limited"
  if (status >= 500) return "provider_unavailable"
  return "provider_failed"
}

function providerFailureCodeResolve(code: unknown, fallbackCode?: ProviderFailureCode): ProviderFailureCode {
  if (code === "aborted" || code === "chat_interrupted") return "chat_interrupted"
  if (
    code === "provider_connection_failed" ||
    code === "provider_failed" ||
    code === "provider_rate_limited" ||
    code === "provider_unavailable"
  ) {
    return code
  }
  if (code === "429") return "provider_rate_limited"
  if (typeof code === "string" && /^5\d\d$/.test(code)) return "provider_unavailable"
  return fallbackCode ?? "provider_failed"
}

function providerAbortErrorResolve(error: unknown, signal: AbortSignal | null | undefined): boolean {
  if (signal?.aborted) return true
  if (typeof error !== "object" || error === null) return false
  const details = error as { code?: unknown; name?: unknown }
  return details.name === "AbortError" || details.name === "APIUserAbortError" || details.code === "ERR_CANCELED"
}

function providerStreamChunkUndefinedFieldsRemove(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerStreamChunkUndefinedFieldsRemove)
  if (value === null || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, providerStreamChunkUndefinedFieldsRemove(entry)]),
  )
}

function providerStreamChunkSanitize(chunk: StreamChunk, fallbackCode?: ProviderFailureCode): StreamChunk {
  const sanitizedChunk = providerStreamChunkUndefinedFieldsRemove(chunk) as StreamChunk
  if (sanitizedChunk.type !== EventType.RUN_ERROR) return sanitizedChunk
  const code = fallbackCode ?? providerFailureCodeResolve(sanitizedChunk.code)
  return {
    code,
    message: providerFailureMessages[code],
    type: EventType.RUN_ERROR,
  }
}

function providerFetchCreate(
  options: ProviderOpenAiCompatibleTextAdapterOptions,
  state: { code?: ProviderFailureCode },
): ProviderFetch {
  return async (input, init) => {
    try {
      const response = await options.fetch(input, init)
      if (response.ok) {
        state.code = undefined
        return response
      }
      state.code = providerFailureCodeFromStatus(response.status)
      throw providerFailureErrorCreate(state.code)
    } catch (error) {
      const errorCode = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined
      if (
        error instanceof Error &&
        (errorCode === "chat_interrupted" ||
          errorCode === "provider_connection_failed" ||
          errorCode === "provider_failed" ||
          errorCode === "provider_rate_limited" ||
          errorCode === "provider_unavailable")
      ) {
        throw error
      }
      if (providerAbortErrorResolve(error, init?.signal)) {
        state.code = "chat_interrupted"
        throw providerFailureErrorCreate(state.code)
      }
      state.code = "provider_connection_failed"
      throw providerFailureErrorCreate(state.code)
    }
  }
}

async function* providerChatStreamCreate(
  adapter: OpenAiCompatibleTextAdapter,
  options: ProviderTextOptions,
  state: { code?: ProviderFailureCode },
): AsyncGenerator<StreamChunk> {
  state.code = undefined
  const stream = adapter.chatStream({
    ...options,
    ...(options.tools !== undefined &&
      options.tools.length > 0 && {
        modelOptions: {
          ...(options.modelOptions ?? {}),
          parallel_tool_calls: false,
        },
      }),
  })
  for await (const chunk of stream) yield providerStreamChunkSanitize(chunk, state.code)
}

export function providerOpenAiCompatibleTextAdapterCreate(
  options: ProviderOpenAiCompatibleTextAdapterOptions,
): OpenAiCompatibleTextAdapter {
  const state: { code?: ProviderFailureCode } = {}
  const adapter = openaiCompatibleText(options.model, {
    api: options.transport === "openai/responses" ? "responses" : "chat-completions",
    apiKey: options.resolvedBearerSecret,
    baseURL: options.baseUrl,
    fetch: providerFetchCreate(options, state),
    maxRetries: 0,
    name: options.provider === "cliproxyapi" ? "CLIProxyAPI" : "Codex-LB",
  })
  const wrappedAdapter = Object.create(adapter) as OpenAiCompatibleTextAdapter
  wrappedAdapter.chatStream = (streamOptions) => providerChatStreamCreate(adapter, streamOptions, state)
  return wrappedAdapter
}
