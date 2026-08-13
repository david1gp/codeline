import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type AgentConfiguration, agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { secretReferenceResolve } from "./secretReferenceResolve.js"

const providerModelDiscoveryDefaultMaxModels = 1_000
const providerModelDiscoveryDefaultMaxResponseBytes = 1_048_576
const providerModelDiscoveryDefaultTimeoutMs = 5_000
const providerModelDiscoveryMaxModels = 1_000
const providerModelDiscoveryMaxResponseBytes = 4 * 1_048_576
const providerModelDiscoveryMaxTimeoutMs = 30_000
const providerModelDiscoveryMaxStringLength = 200

export type ProviderDiscoveredModel = {
  readonly id: string
  readonly name?: string
}

export type ProviderModelDiscoveryOptions = {
  readonly environment: Readonly<Record<string, string | undefined>>
  readonly fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  readonly maxModels?: number
  readonly maxResponseBytes?: number
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

type ProviderModelDiscoveryLimits = {
  readonly maxModels: number
  readonly maxResponseBytes: number
  readonly timeoutMs: number
}

function providerModelDiscoveryLimitsResolve(
  options: ProviderModelDiscoveryOptions,
): Result<ProviderModelDiscoveryLimits> {
  const op = "providerModelDiscovery"
  const maxModels = providerModelDiscoveryLimitResolve(
    options.maxModels,
    providerModelDiscoveryDefaultMaxModels,
    providerModelDiscoveryMaxModels,
  )
  const maxResponseBytes = providerModelDiscoveryLimitResolve(
    options.maxResponseBytes,
    providerModelDiscoveryDefaultMaxResponseBytes,
    providerModelDiscoveryMaxResponseBytes,
  )
  const timeoutMs = providerModelDiscoveryLimitResolve(
    options.timeoutMs,
    providerModelDiscoveryDefaultTimeoutMs,
    providerModelDiscoveryMaxTimeoutMs,
  )
  if (maxModels === undefined || maxResponseBytes === undefined || timeoutMs === undefined) {
    return createResultError(op, "Provider discovery limits must be positive integers.")
  }
  return createResult({ maxModels, maxResponseBytes, timeoutMs })
}

function providerModelDiscoveryLimitResolve(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) return undefined
  return Math.min(value, maximum)
}

function providerModelDiscoveryUrl(baseUrl: string): URL {
  const url = new URL(baseUrl)
  const pathname = url.pathname.replace(/\/+$/, "")
  if (!/\/models$/i.test(pathname)) url.pathname = `${pathname}/models`.replace(/\/+/g, "/")
  return url
}

async function providerModelDiscoveryResponseTextRead(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal,
): Promise<Result<string>> {
  const op = "providerModelDiscovery"
  const contentLength = response.headers.get("content-length")
  if (contentLength !== null && Number(contentLength) > maxResponseBytes) {
    if (response.body !== null) await response.body.cancel().catch(() => undefined)
    return createResultError(op, "The provider model response exceeds the configured size limit.")
  }

  if (response.body === null) {
    try {
      const text = await response.text()
      if (new TextEncoder().encode(text).byteLength > maxResponseBytes) {
        return createResultError(op, "The provider model response exceeds the configured size limit.")
      }
      return createResult(text)
    } catch (_error) {
      return createResultError(op, "The provider model response could not be read.")
    }
  }

  const reader = response.body.getReader()
  const bodyRead = providerModelDiscoveryBodyTextRead(reader, maxResponseBytes)
  let abortListener: (() => void) | undefined

  try {
    return await new Promise<Result<string>>((resolve) => {
      let settled = false
      const finish = (result: Result<string>) => {
        if (settled) return
        settled = true
        if (abortListener !== undefined) signal.removeEventListener("abort", abortListener)
        resolve(result)
      }

      abortListener = () => {
        void reader.cancel().catch(() => undefined)
        finish(createResultError(op, "Provider model discovery was aborted."))
      }
      signal.addEventListener("abort", abortListener, { once: true })
      if (signal.aborted) {
        abortListener()
        return
      }

      void bodyRead.then((result) => {
        finish(result)
      })
    })
  } finally {
    if (abortListener !== undefined) signal.removeEventListener("abort", abortListener)
  }
}

async function providerModelDiscoveryBodyTextRead(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxResponseBytes: number,
): Promise<Result<string>> {
  const op = "providerModelDiscovery"
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (chunk.value === undefined) continue
      totalBytes += chunk.value.byteLength
      if (totalBytes > maxResponseBytes) {
        await reader.cancel().catch(() => undefined)
        return createResultError(op, "The provider model response exceeds the configured size limit.")
      }
      chunks.push(new Uint8Array(chunk.value))
    }
  } catch (_error) {
    return createResultError(op, "The provider model response could not be read.")
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return createResult(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch (_error) {
    return createResultError(op, "The provider model response is not valid UTF-8.")
  }
}

async function providerModelDiscoveryFetch(
  fetchImplementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  url: URL,
  secret: string,
  signal: AbortSignal,
): Promise<Result<Response>> {
  const op = "providerModelDiscovery"
  let abortListener: (() => void) | undefined

  try {
    if (signal.aborted) return createResultError(op, "Provider model discovery was aborted.")
    const response = await Promise.race([
      fetchImplementation(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${secret}`,
        },
        method: "GET",
        signal,
      }),
      new Promise<Response>((_resolve, reject) => {
        abortListener = () => {
          reject(new Error("provider discovery aborted"))
        }
        signal.addEventListener("abort", abortListener, { once: true })
      }),
    ])
    return createResult(response)
  } catch (_error) {
    if (signal.aborted) return createResultError(op, "Provider model discovery was aborted.")
    return createResultError(op, "The provider model list could not be loaded.")
  } finally {
    if (abortListener !== undefined) signal.removeEventListener("abort", abortListener)
  }
}

function providerModelDiscoveryRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function providerModelDiscoveryString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const result = value.trim()
  if (result.length === 0 || result.length > providerModelDiscoveryMaxStringLength) return undefined
  return result
}

function providerModelDiscoveryItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!providerModelDiscoveryRecord(value)) return []

  for (const key of ["data", "models", "results", "items"]) {
    const candidate = value[key]
    if (Array.isArray(candidate)) return candidate
    if (providerModelDiscoveryRecord(candidate)) return Object.values(candidate)
  }
  return []
}

function providerModelDiscoveryItem(value: unknown): ProviderDiscoveredModel | undefined {
  if (typeof value === "string") {
    const id = providerModelDiscoveryString(value)?.replace(/^models\//, "")
    return id ? { id } : undefined
  }
  if (!providerModelDiscoveryRecord(value)) return undefined

  const rawId =
    providerModelDiscoveryString(value.id) ??
    providerModelDiscoveryString(value.model) ??
    providerModelDiscoveryString(value.name)
  const id = rawId?.replace(/^models\//, "")
  if (!id) return undefined

  const hasExplicitId = providerModelDiscoveryString(value.id) !== undefined
  const hasExplicitModel = providerModelDiscoveryString(value.model) !== undefined
  const name =
    providerModelDiscoveryString(value.display_name) ??
    providerModelDiscoveryString(value.displayName) ??
    (hasExplicitId || hasExplicitModel ? providerModelDiscoveryString(value.name) : undefined)

  return name !== undefined && name !== id ? { id, name } : { id }
}

function providerModelDiscoverySort(a: ProviderDiscoveredModel, b: ProviderDiscoveredModel): number {
  const aKey = (a.name ?? a.id).toLowerCase()
  const bKey = (b.name ?? b.id).toLowerCase()
  if (aKey < bKey) return -1
  if (aKey > bKey) return 1
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

function providerModelDiscoveryParse(
  value: unknown,
  maxModels: number,
  secret: string,
): Result<ProviderDiscoveredModel[]> {
  const op = "providerModelDiscovery"
  const seen = new Set<string>()
  const models: ProviderDiscoveredModel[] = []
  for (const item of providerModelDiscoveryItems(value)) {
    const model = providerModelDiscoveryItem(item)
    if (model === undefined || seen.has(model.id)) continue
    if (model.id.includes(secret) || model.name?.includes(secret) === true) continue
    if (models.length >= maxModels) {
      return createResultError(op, "The provider model response contains too many models.")
    }
    seen.add(model.id)
    models.push(model)
  }
  return createResult(models.sort(providerModelDiscoverySort))
}

export async function providerModelDiscovery(
  configuration: unknown,
  options: ProviderModelDiscoveryOptions,
): Promise<Result<ProviderDiscoveredModel[]>> {
  const op = "providerModelDiscovery"
  const parsed = v.safeParse(agentConfigurationSchema, configuration)
  if (!parsed.success) return createResultError(op, "The provider configuration is invalid.")

  const config: AgentConfiguration = parsed.output
  if (config.provider === "deterministic") return createResult([{ id: config.model }])

  const limits = providerModelDiscoveryLimitsResolve(options)
  if (!limits.success) return limits
  if (options.signal?.aborted) return createResultError(op, "Provider model discovery was aborted.")

  const fetchImplementation = options.fetch
  if (fetchImplementation === undefined) {
    return createResultError(op, "Provider model discovery requires an injected fetch implementation.")
  }

  const secret = secretReferenceResolve(config.apiKey, options.environment)
  if (!secret.success) return createResultError(op, secret.errorMessage)

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, limits.data.timeoutMs)
  const onAbort = () => controller.abort()
  options.signal?.addEventListener("abort", onAbort, { once: true })

  try {
    const response = await providerModelDiscoveryFetch(
      fetchImplementation,
      providerModelDiscoveryUrl(config.baseUrl),
      secret.data.value,
      controller.signal,
    )
    if (!response.success) {
      if (timedOut) return createResultError(op, "Provider model discovery timed out.")
      if (options.signal?.aborted) return createResultError(op, "Provider model discovery was aborted.")
      return response
    }
    if (!response.data.ok) return createResultError(op, "The provider model list request failed.")

    const body = await providerModelDiscoveryResponseTextRead(
      response.data,
      limits.data.maxResponseBytes,
      controller.signal,
    )
    if (!body.success) {
      if (timedOut) return createResultError(op, "Provider model discovery timed out.")
      if (options.signal?.aborted) return createResultError(op, "Provider model discovery was aborted.")
      return body
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(body.data)
    } catch (_error) {
      return createResultError(op, "The provider model response is invalid JSON.")
    }
    return providerModelDiscoveryParse(parsedBody, limits.data.maxModels, secret.data.value)
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener("abort", onAbort)
  }
}
