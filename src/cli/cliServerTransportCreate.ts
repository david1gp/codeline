import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { agentListResponseSchema } from "../agents/api/agentListResponseSchema.js"
import { apiHttpClientCreate } from "../api/client/apiHttpClientCreate.js"
import { type GlobalSummarySseFrame, globalSummarySseFrameSchema } from "../events/api/globalSummarySseFrameSchema.js"
import { eventFeedEventParse } from "../events/client/eventFeedEventParse.js"
import { identitySessionCookieName } from "../identity/api/identitySessionCookieName.js"
import { runActiveSnapshotResponseSchema } from "../run/api/runActiveSnapshotResponseSchema.js"
import { runCancelResponseSchema } from "../run/api/runCancelResponseSchema.js"
import { runDetailResponseSchema } from "../run/api/runDetailResponseSchema.js"
import { runCancelInputSchema } from "../run/schema/runCancelInputSchema.js"
import { serverListResponseSchema } from "../servers/api/serverListResponseSchema.js"
import { sessionChatCommandResponseSchema } from "../session/api/sessionChatCommandResponseSchema.js"
import { sessionCreateMutationResponseSchema } from "../session/api/sessionCreateMutationResponseSchema.js"
import { sessionChatRequestSchema } from "../session/schema/sessionChatRequestSchema.js"
import { sessionCreateRequestSchema } from "../session/schema/sessionCreateRequestSchema.js"

type CliServerFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type CliServerTransportOptions =
  | {
      baseUrl: string
      publicOrigin?: string
      sessionToken: string
      fetch?: CliServerFetch
      local?: never
    }
  | {
      local: true
      fetch: CliServerFetch
      baseUrl?: never
      publicOrigin?: never
      sessionToken?: never
    }

function cliServerTransportError(op: string, message: string, code: string) {
  return createResultErrorCode(op, message, code)
}

function cliServerTransportBaseUrlResolve(value: string): Result<URL> {
  const op = "cliServerTransportCreate"
  let url: URL
  try {
    url = new URL(value)
  } catch (_error) {
    return cliServerTransportError(op, "The server URL is invalid.", "invalid_server_url")
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    return cliServerTransportError(op, "The server URL must be an HTTP(S) origin or base path.", "invalid_server_url")
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`
  return createResult(url)
}

function cliServerTransportPublicOriginResolve(value: string | undefined, baseUrl: URL): Result<string> {
  if (value === undefined) return createResult(baseUrl.origin)
  const resolved = cliServerTransportBaseUrlResolve(value)
  if (!resolved.success || resolved.data.pathname !== "/")
    return cliServerTransportError(
      "cliServerTransportCreate",
      "The public origin must be an HTTP(S) origin.",
      "invalid_public_origin",
    )
  return createResult(resolved.data.origin)
}

function cliServerTransportTokenValidate(value: string): Result<void> {
  if (value.length === 0 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value))
    return cliServerTransportError("cliServerTransportCreate", "The session token is invalid.", "invalid_session_token")
  return createResult(undefined)
}

function cliServerTransportSseFieldsParse(block: string): { data: string; event: string; id: string } | null {
  let data = ""
  let event = "message"
  let id: string | undefined
  for (const line of block.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith(":")) continue
    const separator = line.indexOf(":")
    const field = separator < 0 ? line : line.slice(0, separator)
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "")
    if (field === "data") data += `${data.length === 0 ? "" : "\n"}${value}`
    if (field === "event") event = value
    if (field === "id" && !value.includes("\0")) id = value
  }
  return data.length === 0 || id === undefined ? null : { data, event, id }
}

async function* cliServerTransportSseRead(response: Response): AsyncGenerator<Result<GlobalSummarySseFrame>> {
  const reader = response.body?.getReader()
  if (reader === undefined) {
    yield cliServerTransportError(
      "cliServerTransportRunEvents",
      "The event stream body is missing.",
      "invalid_event_stream",
    )
    return
  }
  const decoder = new TextDecoder()
  let buffer = ""
  let ended = false
  try {
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ""
      for (const block of blocks) {
        const fields = cliServerTransportSseFieldsParse(block)
        if (fields === null) continue
        const frame = eventFeedEventParse(fields)
        yield frame
      }
      if (chunk.done) {
        ended = true
        break
      }
    }
  } catch (_error) {
    yield cliServerTransportError(
      "cliServerTransportRunEvents",
      "The event stream could not be read.",
      "event_stream_error",
    )
  } finally {
    if (!ended) {
      try {
        await reader.cancel()
      } catch (_error) {
        // The response may already have closed while the run was finishing.
      }
    }
    reader.releaseLock()
  }
}

export function cliServerTransportCreate(options: CliServerTransportOptions) {
  const resolvedBase = cliServerTransportBaseUrlResolve(options.local ? "http://local.invalid" : options.baseUrl)
  if (!resolvedBase.success) return resolvedBase
  const tokenValid = options.local ? createResult(undefined) : cliServerTransportTokenValidate(options.sessionToken)
  if (!tokenValid.success) return tokenValid
  const publicOrigin = cliServerTransportPublicOriginResolve(options.publicOrigin, resolvedBase.data)
  if (!publicOrigin.success) return publicOrigin

  const fetcher = options.fetch ?? globalThis.fetch
  const cookie = options.local ? undefined : `${identitySessionCookieName}=${options.sessionToken}`
  const requestUrlResolve = (input: RequestInfo | URL): URL => {
    const requestPath = String(input)
    const url = new URL(requestPath, resolvedBase.data)
    if (requestPath.startsWith("/")) {
      const relativePath = new URL(requestPath, resolvedBase.data).pathname.slice(1)
      url.pathname = `${resolvedBase.data.pathname}${relativePath}`
    }
    return url
  }
  const client = apiHttpClientCreate({
    fetch: (input, init) => {
      const url = requestUrlResolve(input)
      const headers = new Headers(init?.headers)
      if (cookie !== undefined) headers.set("Cookie", cookie)
      if (
        !options.local &&
        init?.method !== undefined &&
        init.method.toUpperCase() !== "GET" &&
        init.method.toUpperCase() !== "HEAD"
      ) {
        headers.set("Origin", publicOrigin.data)
        if (publicOrigin.data !== resolvedBase.data.origin) headers.set("Host", new URL(publicOrigin.data).host)
      }
      // An opaque identity cookie must never follow a redirect to another endpoint/origin.
      return fetcher(url, { ...init, headers, redirect: "error" })
    },
  })

  const sessionCreate = (body: v.InferInput<typeof sessionCreateRequestSchema>, signal?: AbortSignal) =>
    client.post({
      body,
      op: "cliServerSessionCreate",
      path: "/api/sessions",
      requestSchema: sessionCreateRequestSchema,
      responseSchema: sessionCreateMutationResponseSchema,
      ...(signal === undefined ? {} : { signal }),
    })

  const serverList = (signal?: AbortSignal) =>
    client.get({
      cache: "no-store",
      coalesce: false,
      op: "cliServerList",
      path: "/api/servers",
      responseSchema: serverListResponseSchema,
      ...(signal === undefined ? {} : { signal }),
    })

  const agentList = (serverId: string, signal?: AbortSignal) =>
    client.get({
      cache: "no-store",
      coalesce: false,
      op: "cliServerAgentList",
      path: `/api/servers/${encodeURIComponent(serverId)}/agents`,
      responseSchema: agentListResponseSchema,
      ...(signal === undefined ? {} : { signal }),
    })

  const runSnapshot = (sessionId: string, runId: string, signal?: AbortSignal) =>
    client.get({
      cache: "no-store",
      coalesce: false,
      op: "cliServerRunSnapshot",
      path: `/api/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/snapshot`,
      responseSchema: runActiveSnapshotResponseSchema,
      ...(signal === undefined ? {} : { signal }),
    })

  const runDetail = (sessionId: string, runId: string, signal?: AbortSignal) =>
    client.get({
      cache: "no-store",
      coalesce: false,
      op: "cliServerRunDetail",
      path: `/api/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/detail`,
      responseSchema: runDetailResponseSchema,
      ...(signal === undefined ? {} : { signal }),
    })

  const chatSubmit = (sessionId: string, body: v.InferInput<typeof sessionChatRequestSchema>, signal?: AbortSignal) =>
    client.post({
      body,
      op: "cliServerChatSubmit",
      path: `/api/sessions/${encodeURIComponent(sessionId)}/chat`,
      requestSchema: sessionChatRequestSchema,
      responseSchema: sessionChatCommandResponseSchema,
      ...(signal === undefined ? {} : { signal }),
    })

  const runCancel = (sessionId: string, runId: string, signal?: AbortSignal) =>
    client.post({
      body: {},
      op: "cliServerRunCancel",
      path: `/api/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/cancel`,
      requestSchema: runCancelInputSchema,
      responseSchema: runCancelResponseSchema,
      ...(signal === undefined ? {} : { signal }),
    })

  const runEvents = async function* (sessionId: string, runId: string, signal?: AbortSignal) {
    const op = "cliServerTransportRunEvents"
    let cursor: string | undefined
    while (!signal?.aborted) {
      const url = requestUrlResolve(
        `/api/events${cursor === undefined ? "" : `?${new URLSearchParams({ after: cursor })}`}`,
      )
      let response: Response
      try {
        const headers = new Headers({ Accept: "text/event-stream" })
        if (cookie !== undefined) headers.set("Cookie", cookie)
        response = await fetcher(url, { headers, redirect: "error", ...(signal === undefined ? {} : { signal }) })
      } catch (_error) {
        if (signal?.aborted) return
        yield cliServerTransportError(op, "The event stream request could not be completed.", "network_error")
        return
      }
      if (!response.ok || !response.headers.get("Content-Type")?.toLowerCase().startsWith("text/event-stream")) {
        yield cliServerTransportError(op, "The event stream request was rejected.", `http_${response.status}`)
        return
      }
      let terminal = false
      for await (const result of cliServerTransportSseRead(response)) {
        if (!result.success) {
          yield result
          return
        }
        const parsed = v.safeParse(globalSummarySseFrameSchema, result.data)
        if (!parsed.success) {
          yield cliServerTransportError(op, "The event does not match the shared contract.", "invalid_event")
          return
        }
        cursor = parsed.output.id
        if (
          "sessionId" in parsed.output.data &&
          "runId" in parsed.output.data &&
          parsed.output.data.sessionId === sessionId &&
          parsed.output.data.runId === runId
        ) {
          yield createResult(parsed.output)
          if (
            parsed.output.event === "run-completed" ||
            parsed.output.event === "run-failed" ||
            parsed.output.event === "run-cancelled" ||
            parsed.output.event === "run-interrupted"
          ) {
            terminal = true
            break
          }
        }
      }
      if (terminal || signal?.aborted) return
      if (cursor === undefined) {
        yield cliServerTransportError(op, "The event stream closed before replay was available.", "event_stream_closed")
        return
      }
    }
  }

  // Global events contain lifecycle summaries, not assistant text. One-shot output polls runSnapshot.
  return createResult({
    agentList,
    chatSubmit,
    runCancel,
    runDetail,
    runEvents,
    runSnapshot,
    serverList,
    sessionCreate,
  })
}
