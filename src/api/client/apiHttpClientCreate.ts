import {
  createResult,
  createResultErrorCode,
  type Result,
  type ResultErr,
  resultTryParsingFetchErr,
} from "@adaptive-ds/result"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../errors/apiErrorResponseSchema.js"
import { apiQueryKeyCreate } from "./apiQueryKeyCreate.js"

type ApiHttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type ApiHttpMethod = "DELETE" | "GET" | "PATCH" | "POST"
type ApiHttpQuery =
  | Readonly<
      Record<
        string,
        boolean | null | number | string | readonly (boolean | null | number | string | undefined)[] | undefined
      >
    >
  | URLSearchParams

type ApiHttpClientDependencies = {
  fetch: ApiHttpFetch
}

type ApiHttpRequestInput<
  TSchema extends v.GenericSchema,
  TRequestSchema extends v.GenericSchema | undefined = undefined,
> = {
  body?: TRequestSchema extends v.GenericSchema ? v.InferInput<TRequestSchema> : never
  coalesce?: boolean
  headers?: HeadersInit
  method: ApiHttpMethod
  op?: string
  path: string
  query?: ApiHttpQuery
  requestSchema?: TRequestSchema
  responseSchema: TSchema
  signal?: AbortSignal
}

type ApiHttpRequestTypedInput<
  TSchema extends v.GenericSchema,
  TRequestSchema extends v.GenericSchema,
> = ApiHttpRequestInput<TSchema, TRequestSchema> & {
  body: v.InferInput<TRequestSchema>
  requestSchema: TRequestSchema
}

type ApiHttpRequestBodylessInput<TSchema extends v.GenericSchema> = Omit<
  ApiHttpRequestInput<TSchema>,
  "body" | "requestSchema"
> & {
  body?: undefined
  requestSchema?: undefined
}

type ApiHttpMethodInput<TSchema extends v.GenericSchema, TRequestSchema extends v.GenericSchema = v.GenericSchema> =
  | Omit<ApiHttpRequestBodylessInput<TSchema>, "method">
  | Omit<ApiHttpRequestTypedInput<TSchema, TRequestSchema>, "method">

type ApiHttpClientLoadedResponse = {
  body: string | undefined
  ok: boolean
  status: number
  statusText: string
}

type ApiHttpClientResponseResult = Result<ApiHttpClientLoadedResponse>

function apiHttpClientErrorCreate(
  op: string,
  message: string,
  code: string,
  statusCode?: number,
  errorData?: string,
): ResultErr {
  const result = createResultErrorCode(op, message, code)
  if (statusCode !== undefined) result.statusCode = statusCode
  if (errorData !== undefined) result.errorData = errorData
  return result
}

function apiHttpClientAbortResult(op: string): ResultErr {
  return apiHttpClientErrorCreate(op, "The request was aborted.", "aborted")
}

function apiHttpClientPathValidate(path: unknown, op: string): Result<void> {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\r\n]/.test(path) ||
    /%(?![0-9a-fA-F]{2})/.test(path)
  ) {
    return apiHttpClientErrorCreate(op, "The request path is invalid.", "invalid_request")
  }
  return createResult(undefined)
}

function apiHttpClientRequestBodyResolve<
  TSchema extends v.GenericSchema,
  TRequestSchema extends v.GenericSchema | undefined,
>(input: ApiHttpRequestInput<TSchema, TRequestSchema>, op: string): Result<unknown> {
  if (input.body === undefined) return createResult(undefined)
  if (input.requestSchema === undefined)
    return apiHttpClientErrorCreate(op, "Request bodies require a Valibot contract.", "invalid_request")
  const parsed = v.safeParse(input.requestSchema, input.body)
  if (parsed.success) return createResult(parsed.output)
  return apiHttpClientErrorCreate(
    op,
    "The request body does not match its contract.",
    "invalid_request",
    undefined,
    v.summarize(parsed.issues),
  )
}

function apiHttpClientHeadersCreate<
  TSchema extends v.GenericSchema,
  TRequestSchema extends v.GenericSchema | undefined,
>(input: ApiHttpRequestInput<TSchema, TRequestSchema>, hasBody: boolean, op: string): Result<Headers> {
  let headers: Headers
  try {
    headers = new Headers(input.headers)
  } catch (_error) {
    return apiHttpClientErrorCreate(op, "The request headers are invalid.", "invalid_request")
  }

  if (!headers.has("Accept")) headers.set("Accept", "application/json")
  if (hasBody && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  return createResult(headers)
}

function apiHttpClientHeadersKey(headers: Headers): string {
  return JSON.stringify(
    Array.from(headers.entries()).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  )
}

function apiHttpClientJsonParse(body: string, op: string): Result<unknown> {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson()), body)
  if (!parsed.success) {
    return apiHttpClientErrorCreate(op, "The response body is not valid JSON.", "invalid_json", undefined, body)
  }
  return createResult(parsed.output)
}

function apiHttpClientResponseError(response: ApiHttpClientLoadedResponse, body: string, op: string): ResultErr {
  const parsedBody = apiHttpClientJsonParse(body, op)
  if (parsedBody.success) {
    const parsedError = v.safeParse(apiErrorResponseSchema, parsedBody.data)
    if (parsedError.success) {
      return apiHttpClientErrorCreate(
        op,
        parsedError.output.error.message,
        parsedError.output.error.code,
        response.status,
        JSON.stringify(parsedError.output),
      )
    }
  }

  const result: ResultErr = resultTryParsingFetchErr(
    op,
    body,
    response.status,
    response.statusText || "The request failed.",
  )
  result.op = op
  if (result.code === undefined) result.code = "http_error"
  return result
}

function apiHttpClientResponseParse<TSchema extends v.GenericSchema>(
  response: ApiHttpClientLoadedResponse,
  body: string,
  schema: TSchema,
  op: string,
): Result<v.InferOutput<TSchema>> {
  const parsedBody = apiHttpClientJsonParse(body, op)
  if (!parsedBody.success) return parsedBody

  const parsed = v.safeParse(schema, parsedBody.data)
  if (!parsed.success) {
    return apiHttpClientErrorCreate(
      op,
      "The response body does not match its contract.",
      "invalid_response",
      response.status,
      v.summarize(parsed.issues),
    )
  }
  return createResult(parsed.output)
}

function apiHttpClientEmptyResponseParse<TSchema extends v.GenericSchema>(
  response: ApiHttpClientLoadedResponse,
  schema: TSchema,
  op: string,
): Result<v.InferOutput<TSchema>> {
  const parsed = v.safeParse(schema, undefined)
  if (!parsed.success) {
    return apiHttpClientErrorCreate(
      op,
      "The empty response does not match its contract.",
      "invalid_response",
      response.status,
      v.summarize(parsed.issues),
    )
  }
  return createResult(parsed.output)
}

async function apiHttpClientResponseLoad(
  dependencies: ApiHttpClientDependencies,
  url: string,
  headers: Headers,
  method: ApiHttpMethod,
  body: string | undefined,
  op: string,
  signal: AbortSignal | undefined,
): Promise<ApiHttpClientResponseResult> {
  const init: RequestInit = {
    headers,
    method,
  }
  if (body !== undefined) init.body = body
  if (signal !== undefined) init.signal = signal

  let responseValue: unknown
  try {
    responseValue = await dependencies.fetch(url, init)
  } catch (_error) {
    if (signal?.aborted) return apiHttpClientAbortResult(op)
    return apiHttpClientErrorCreate(op, "The request could not be completed.", "network_error")
  }

  if (signal?.aborted) return apiHttpClientAbortResult(op)

  let response: ApiHttpClientLoadedResponse
  try {
    if (typeof responseValue !== "object" || responseValue === null) throw new Error("response is not an object")
    const candidate = responseValue as Partial<Response>
    if (
      typeof candidate.status !== "number" ||
      !Number.isInteger(candidate.status) ||
      candidate.status < 100 ||
      candidate.status > 599 ||
      typeof candidate.ok !== "boolean" ||
      typeof candidate.text !== "function" ||
      (candidate.statusText !== undefined && typeof candidate.statusText !== "string")
    )
      throw new Error("response shape is invalid")
    response = {
      body: undefined,
      ok: candidate.ok,
      status: candidate.status,
      statusText: candidate.statusText ?? "",
    }

    if (response.status === 204 || response.status === 205) return createResult(response)

    const responseBody = await candidate.text.call(responseValue)
    if (typeof responseBody !== "string") throw new Error("response body is not text")
    response.body = responseBody
  } catch (_error) {
    if (signal?.aborted) return apiHttpClientAbortResult(op)
    return apiHttpClientErrorCreate(op, "The injected fetch response is invalid.", "invalid_response")
  }

  if (signal?.aborted) return apiHttpClientAbortResult(op)
  return createResult(response)
}

function apiHttpClientResultOperationSet<T>(result: Result<T>, op: string): Result<T> {
  if (result.success || result.op === op) return result
  return { ...result, op }
}

function apiHttpClientResultAwait<T>(
  promise: Promise<Result<T>>,
  signal: AbortSignal | undefined,
  op: string,
): Promise<Result<T>> {
  if (signal === undefined) return promise.then((result) => apiHttpClientResultOperationSet(result, op))
  if (signal.aborted) return Promise.resolve(apiHttpClientAbortResult(op))

  return new Promise((resolve) => {
    let settled = false
    const cleanup = () => signal.removeEventListener("abort", abort)
    const finish = (result: Result<T>) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(apiHttpClientResultOperationSet(result, op))
    }
    const abort = () => finish(apiHttpClientAbortResult(op))
    signal.addEventListener("abort", abort, { once: true })
    void promise.then(finish, () =>
      finish(apiHttpClientErrorCreate(op, "The request could not be completed.", "network_error")),
    )
  })
}

function apiHttpClientRequestKey<TSchema extends v.GenericSchema, TRequestSchema extends v.GenericSchema | undefined>(
  input: ApiHttpRequestInput<TSchema, TRequestSchema>,
  url: string,
  headers: Headers,
): string {
  return JSON.stringify({
    headers: apiHttpClientHeadersKey(headers),
    method: input.method,
    url,
  })
}

function apiHttpClientLoadedResponseResolve<TSchema extends v.GenericSchema>(
  loadedResponse: ApiHttpClientLoadedResponse,
  schema: TSchema,
  op: string,
): Result<v.InferOutput<TSchema>> {
  if (loadedResponse.status === 204 || loadedResponse.status === 205)
    return apiHttpClientEmptyResponseParse(loadedResponse, schema, op)
  if (loadedResponse.body === undefined)
    return apiHttpClientErrorCreate(op, "The response body is missing.", "invalid_response", loadedResponse.status)
  if (!loadedResponse.ok) return apiHttpClientResponseError(loadedResponse, loadedResponse.body, op)
  return apiHttpClientResponseParse(loadedResponse, loadedResponse.body, schema, op)
}

export function apiHttpClientCreate(dependencies: ApiHttpClientDependencies) {
  const inFlight = new Map<string, Promise<ApiHttpClientResponseResult>>()

  const request = async <
    TSchema extends v.GenericSchema,
    TRequestSchema extends v.GenericSchema | undefined = undefined,
  >(
    input: ApiHttpRequestInput<TSchema, TRequestSchema>,
  ): Promise<Result<v.InferOutput<TSchema>>> => {
    const op = input.op ?? "apiHttpClientRequest"
    const validPath = apiHttpClientPathValidate(input.path, op)
    if (!validPath.success) return validPath
    if (input.method === "GET" && input.body !== undefined) {
      return apiHttpClientErrorCreate(op, "GET requests cannot include a body.", "invalid_request")
    }
    if (input.signal?.aborted) return apiHttpClientAbortResult(op)

    const bodyResult = apiHttpClientRequestBodyResolve(input, op)
    if (!bodyResult.success) return bodyResult

    let body: string | undefined
    if (bodyResult.data !== undefined) {
      try {
        body = JSON.stringify(bodyResult.data)
      } catch (_error) {
        return apiHttpClientErrorCreate(op, "The request body could not be serialized.", "invalid_request")
      }
      if (body === undefined)
        return apiHttpClientErrorCreate(op, "The request body could not be serialized.", "invalid_request")
    }

    const headersResult = apiHttpClientHeadersCreate(input, body !== undefined, op)
    if (!headersResult.success) return headersResult
    let url: string
    try {
      url = apiQueryKeyCreate(input.path, input.query)
    } catch (_error) {
      return apiHttpClientErrorCreate(op, "The request path or query is invalid.", "invalid_request")
    }
    const load = () =>
      apiHttpClientResponseLoad(dependencies, url, headersResult.data, input.method, body, op, undefined)

    if (input.method !== "GET" || input.coalesce === false) {
      const loadedResponse = await apiHttpClientResponseLoad(
        dependencies,
        url,
        headersResult.data,
        input.method,
        body,
        op,
        input.signal,
      )
      if (!loadedResponse.success) return loadedResponse
      return apiHttpClientLoadedResponseResolve(loadedResponse.data, input.responseSchema, op)
    }

    // Coalescing is transport-level. Every caller validates the shared body with its own schema.
    const key = apiHttpClientRequestKey(input, url, headersResult.data)
    const existing = inFlight.get(key)
    if (existing !== undefined) {
      const loadedResponse = await apiHttpClientResultAwait(existing, input.signal, op)
      if (!loadedResponse.success) return loadedResponse
      return apiHttpClientLoadedResponseResolve(loadedResponse.data, input.responseSchema, op)
    }

    const pending = load()
    inFlight.set(key, pending)
    void pending.then(
      () => {
        if (inFlight.get(key) === pending) inFlight.delete(key)
      },
      () => {
        if (inFlight.get(key) === pending) inFlight.delete(key)
      },
    )
    const loadedResponse = await apiHttpClientResultAwait(pending, input.signal, op)
    if (!loadedResponse.success) return loadedResponse
    return apiHttpClientLoadedResponseResolve(loadedResponse.data, input.responseSchema, op)
  }

  const get = <TSchema extends v.GenericSchema, TRequestSchema extends v.GenericSchema = v.GenericSchema>(
    input: ApiHttpMethodInput<TSchema, TRequestSchema>,
  ) => request({ ...input, method: "GET" as const } as ApiHttpRequestInput<TSchema, TRequestSchema>)
  const post = <TSchema extends v.GenericSchema, TRequestSchema extends v.GenericSchema = v.GenericSchema>(
    input: ApiHttpMethodInput<TSchema, TRequestSchema>,
  ) => request({ ...input, method: "POST" as const } as ApiHttpRequestInput<TSchema, TRequestSchema>)
  const patch = <TSchema extends v.GenericSchema, TRequestSchema extends v.GenericSchema = v.GenericSchema>(
    input: ApiHttpMethodInput<TSchema, TRequestSchema>,
  ) => request({ ...input, method: "PATCH" as const } as ApiHttpRequestInput<TSchema, TRequestSchema>)
  const remove = <TSchema extends v.GenericSchema, TRequestSchema extends v.GenericSchema = v.GenericSchema>(
    input: ApiHttpMethodInput<TSchema, TRequestSchema>,
  ) => request({ ...input, method: "DELETE" as const } as ApiHttpRequestInput<TSchema, TRequestSchema>)

  return { delete: remove, get, patch, post, request }
}
