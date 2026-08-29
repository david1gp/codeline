import { EventType, type StreamChunk } from "@tanstack/ai"
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible"

type ProviderLabel = "cliproxyapi" | "codex-lb"
type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type ProviderFailureCode =
  | "chat_interrupted"
  | "provider_connection_failed"
  | "provider_context_overflow"
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
type ProviderFailureState = { code?: ProviderFailureCode }

const providerFailureMessages: Record<ProviderFailureCode, string> = {
  chat_interrupted: "The provider request was aborted.",
  provider_connection_failed: "The provider connection failed.",
  provider_context_overflow: "The provider context window was exceeded.",
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

function providerContextOverflowDetect(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    /context[\s_-]*(?:length|window)[\s_-]*(?:exceed(?:ed|s)?|overflow|too\s+(?:large|long))/.test(normalized) ||
    /maximum\s+context\s+(?:length|window)/.test(normalized) ||
    /(?:input|prompt|request)[^.!?]{0,100}(?:exceed(?:ed|s)?|too\s+(?:large|long))[^.!?]{0,100}context/.test(
      normalized,
    ) ||
    /(?:input|prompt|request)\s+too\s+(?:large|long)[^.!?]{0,100}(?:model\s+)?context/.test(normalized)
  )
}

type ProviderErrorFields = {
  code?: string
  message?: string
  param?: string
  type?: string
}

type ProviderErrorFieldsParse = {
  fields: ProviderErrorFields
  structured: boolean
}

function providerErrorFieldsParse(value: unknown): ProviderErrorFieldsParse | undefined {
  let parsed = value
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch (_error) {
      return undefined
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined

  const record = parsed as Record<string, unknown>
  const candidate =
    typeof record.error === "object" && record.error !== null && !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : record
  const fields: ProviderErrorFields = {}
  for (const field of ["code", "message", "param", "type"] as const) {
    if (typeof candidate[field] === "string") fields[field] = candidate[field]
  }
  return {
    fields,
    structured: "error" in record || Object.keys(fields).length > 0,
  }
}

function providerErrorFieldsOverflowDetect(fields: ProviderErrorFields): boolean {
  return Object.values(fields).some((value) => providerContextOverflowDetect(value))
}

function providerFailureCodeFromBody(body: string): ProviderFailureCode | undefined {
  const parsed = providerErrorFieldsParse(body)
  if (parsed?.structured) {
    return providerErrorFieldsOverflowDetect(parsed.fields) ? "provider_context_overflow" : undefined
  }
  return providerContextOverflowDetect(body) ? "provider_context_overflow" : undefined
}

async function providerFailureCodeFromResponse(response: Response): Promise<ProviderFailureCode> {
  try {
    const body = await response.clone().text()
    const bodyCode = providerFailureCodeFromBody(body.slice(0, 8_192))
    if (bodyCode !== undefined) return bodyCode
  } catch (_error) {
    // The status remains a safe fallback when an error body cannot be inspected.
  }
  return providerFailureCodeFromStatus(response.status)
}

function providerFailureCodeResolve(code: unknown, fallbackCode?: ProviderFailureCode): ProviderFailureCode {
  if (code === "aborted" || code === "chat_interrupted") return "chat_interrupted"
  if (
    code === "provider_connection_failed" ||
    code === "provider_context_overflow" ||
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
  const errorCandidates: unknown[] = [sanitizedChunk]
  if (typeof sanitizedChunk === "object" && sanitizedChunk !== null) {
    const chunkRecord = sanitizedChunk as Record<string, unknown>
    if (chunkRecord.error !== undefined) errorCandidates.push(chunkRecord.error)
    if (chunkRecord.rawEvent !== undefined) errorCandidates.push(chunkRecord.rawEvent)
  }
  const hasContextOverflow = errorCandidates.some((candidate) => {
    const parsed = providerErrorFieldsParse(candidate)
    return parsed !== undefined && providerErrorFieldsOverflowDetect(parsed.fields)
  })
  const code = hasContextOverflow
    ? "provider_context_overflow"
    : (fallbackCode ?? providerFailureCodeResolve(sanitizedChunk.code))
  return {
    code,
    message: providerFailureMessages[code],
    type: EventType.RUN_ERROR,
  }
}

function providerFetchCreate(
  options: ProviderOpenAiCompatibleTextAdapterOptions,
  state: ProviderFailureState,
): ProviderFetch {
  return async (input, init) => {
    try {
      const response = await options.fetch(input, init)
      if (response.ok) {
        state.code = undefined
        return response
      }
      state.code = await providerFailureCodeFromResponse(response)
      throw providerFailureErrorCreate(state.code)
    } catch (error) {
      const errorCode = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined
      if (
        error instanceof Error &&
        (errorCode === "chat_interrupted" ||
          errorCode === "provider_connection_failed" ||
          errorCode === "provider_context_overflow" ||
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
  state: ProviderFailureState,
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
  for await (const chunk of stream) {
    if (options.request?.signal?.aborted) {
      yield providerStreamChunkSanitize(
        {
          code: "chat_interrupted",
          message: providerFailureMessages.chat_interrupted,
          timestamp: Date.now(),
          type: EventType.RUN_ERROR,
        },
        "chat_interrupted",
      )
      return
    }
    yield providerStreamChunkSanitize(chunk, state.code)
  }
}

function providerOpenAiCompatibleTextAdapterWithStateCreate(
  options: ProviderOpenAiCompatibleTextAdapterOptions,
  state: ProviderFailureState,
): OpenAiCompatibleTextAdapter {
  return openaiCompatibleText(options.model, {
    api: options.transport === "openai/responses" ? "responses" : "chat-completions",
    apiKey: options.resolvedBearerSecret,
    baseURL: options.baseUrl,
    fetch: providerFetchCreate(options, state),
    maxRetries: 0,
    name: options.provider === "cliproxyapi" ? "CLIProxyAPI" : "Codex-LB",
  })
}

export function providerOpenAiCompatibleTextAdapterCreate(
  options: ProviderOpenAiCompatibleTextAdapterOptions,
): OpenAiCompatibleTextAdapter {
  const adapter = providerOpenAiCompatibleTextAdapterWithStateCreate(options, {})
  const wrappedAdapter = Object.create(adapter) as OpenAiCompatibleTextAdapter
  wrappedAdapter.chatStream = (streamOptions) => {
    const state: ProviderFailureState = {}
    const requestAdapter = providerOpenAiCompatibleTextAdapterWithStateCreate(options, state)
    return providerChatStreamCreate(requestAdapter, streamOptions, state)
  }
  return wrappedAdapter
}
