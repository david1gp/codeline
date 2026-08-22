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

type ApiHttpResponseResult = Result<unknown>

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

function apiHttpClientPathValidate(path: string, op: string): Result<void> {
  if (
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

function apiHttpClientSchemaKey<TSchema extends v.GenericSchema>(
  schema: TSchema,
  schemaKeys: WeakMap<object, number>,
  nextSchemaKey: { value: number },
): number {
  const objectSchema = schema as object
  const existing = schemaKeys.get(objectSchema)
  if (existing !== undefined) return existing
  const next = nextSchemaKey.value
  nextSchemaKey.value += 1
  schemaKeys.set(objectSchema, next)
  return next
}

function apiHttpClientJsonParse(body: string, op: string): Result<unknown> {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson()), body)
  if (!parsed.success) {
    return apiHttpClientErrorCreate(op, "The response body is not valid JSON.", "invalid_json", undefined, body)
  }
  return createResult(parsed.output)
}

function apiHttpClientResponseError(response: Response, body: string, op: string): ResultErr {
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
  response: Response,
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
  response: Response,
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

async function apiHttpClientResponseLoad<
  TSchema extends v.GenericSchema,
  TRequestSchema extends v.GenericSchema | undefined,
>(
  dependencies: ApiHttpClientDependencies,
  input: ApiHttpRequestInput<TSchema, TRequestSchema>,
  url: string,
  headers: Headers,
  body: string | undefined,
  op: string,
  signal: AbortSignal | undefined,
): Promise<Result<v.InferOutput<TSchema>>> {
  const init: RequestInit = {
    headers,
    method: input.method,
  }
  if (body !== undefined) init.body = body
  if (signal !== undefined) init.signal = signal

  let response: Response
  try {
    response = await dependencies.fetch(url, init)
  } catch (_error) {
    if (signal?.aborted) return apiHttpClientAbortResult(op)
    return apiHttpClientErrorCreate(op, "The request could not be completed.", "network_error")
  }

  if (response.status === 204 || response.status === 205)
    return apiHttpClientEmptyResponseParse(response, input.responseSchema, op)

  let responseBody: string
  try {
    responseBody = await response.text()
  } catch (_error) {
    return apiHttpClientErrorCreate(op, "The response could not be read.", "response_read_error", response.status)
  }
  if (!response.ok) return apiHttpClientResponseError(response, responseBody, op)
  return apiHttpClientResponseParse(response, responseBody, input.responseSchema, op)
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
  schemaKeys: WeakMap<object, number>,
  nextSchemaKey: { value: number },
): string {
  return JSON.stringify({
    headers: apiHttpClientHeadersKey(headers),
    method: input.method,
    schema: apiHttpClientSchemaKey(input.responseSchema, schemaKeys, nextSchemaKey),
    url,
  })
}

export function apiHttpClientCreate(dependencies: ApiHttpClientDependencies) {
  const inFlight = new Map<string, Promise<ApiHttpResponseResult>>()
  const schemaKeys = new WeakMap<object, number>()
  const nextSchemaKey = { value: 1 }

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
    const load = () => apiHttpClientResponseLoad(dependencies, input, url, headersResult.data, body, op, undefined)

    if (input.method !== "GET" || input.coalesce === false) {
      return apiHttpClientResponseLoad(dependencies, input, url, headersResult.data, body, op, input.signal)
    }

    const key = apiHttpClientRequestKey(input, url, headersResult.data, schemaKeys, nextSchemaKey)
    const existing = inFlight.get(key)
    if (existing !== undefined)
      return apiHttpClientResultAwait(existing as Promise<Result<v.InferOutput<TSchema>>>, input.signal, op)

    const pending = load() as Promise<ApiHttpResponseResult>
    inFlight.set(key, pending)
    void pending.then(
      () => {
        if (inFlight.get(key) === pending) inFlight.delete(key)
      },
      () => {
        if (inFlight.get(key) === pending) inFlight.delete(key)
      },
    )
    return apiHttpClientResultAwait(pending as Promise<Result<v.InferOutput<TSchema>>>, input.signal, op)
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
