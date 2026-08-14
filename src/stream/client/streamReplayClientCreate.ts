import {
  createResult,
  createResultError,
  createResultErrorCode,
  type Result,
  type ResultErr,
} from "@adaptive-ds/result"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../../api/errors/apiErrorResponseSchema.js"
import { streamApiErrorResponseSchema } from "../api/streamApiErrorResponseSchema.js"
import { executionStreamEventSchema } from "../schema/executionStreamEventSchema.js"

const streamReplayClientDefaultLimit = 100
const streamReplayClientMaxEventIdLength = 2_048
const streamReplayClientMaxEventTypeLength = 256
const streamReplayClientExecutionEventTypes = new Set([
  "terminal",
  "text_delta",
  "thinking_status",
  "tool_output",
  "tool_result",
  "tool_start",
  "written_file",
])

type StreamReplayClientSseRecord = {
  data: string
  event: string
  id: string
}

type StreamReplayClientEventWithoutSequence = {
  eventType: string
  id: string
  payload: unknown
}

type StreamReplayClientState = {
  // The SSE contract carries opaque event IDs; ordered batches establish the local sequence correlation.
  eventSequences: Map<string, number>
  lastEventId: string | null
  lastSequence: number
  sequenceEventIds: Map<number, string>
  seenSequences: Set<number>
  terminalEvent: StreamReplayClientEvent | null
}

type StreamReplayClientOptions = {
  afterEventId?: string
  afterSequence?: number
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionId: string
  streamId: string
}

type StreamReplayClientReplayOptions = {
  afterEventId?: string
  afterSequence?: number
  limit?: number
  signal?: AbortSignal
}

type StreamReplayClientEvent = StreamReplayClientEventWithoutSequence & {
  sequence: number
}

type StreamReplayClientReplay = {
  events: Array<StreamReplayClientEvent>
  lastEventId: string | null
  lastSequence: number
  outcome: "active" | "terminal"
  terminalEvent: StreamReplayClientEvent | null
}

function streamReplayClientError(op: string, message: string): ResultErr {
  return createResultErrorCode(op, message, "stream_replay_error")
}

function streamReplayClientSequenceValidate(value: number | undefined, op: string): Result<void> {
  if (value === undefined) return createResult(undefined)
  if (!Number.isSafeInteger(value) || value < 0) return createResultError(op, "The stream sequence is invalid.")
  return createResult(undefined)
}

function streamReplayClientOptionsValidate(
  options: StreamReplayClientOptions,
  input: StreamReplayClientReplayOptions,
): Result<void> {
  const op = "streamReplayClientReplay"
  if (options.sessionId.length === 0 || options.streamId.length === 0) {
    return createResultError(op, "The replay session and stream IDs are required.")
  }

  const initialSequence = streamReplayClientSequenceValidate(options.afterSequence, op)
  if (!initialSequence.success) return initialSequence
  if (options.afterEventId !== undefined && options.afterSequence === undefined) {
    return createResultError(op, "The stream event cursor requires a known sequence.")
  }
  const requestedSequence = streamReplayClientSequenceValidate(input.afterSequence, op)
  if (!requestedSequence.success) return requestedSequence

  for (const eventId of [options.afterEventId, input.afterEventId]) {
    if (eventId !== undefined && (eventId.length === 0 || eventId.length > streamReplayClientMaxEventIdLength)) {
      return createResultError(op, "The stream event cursor is invalid.")
    }
    if (eventId !== undefined && /[\r\n]/.test(eventId)) {
      return createResultError(op, "The stream event cursor is invalid.")
    }
  }

  const limit = input.limit ?? streamReplayClientDefaultLimit
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > streamReplayClientDefaultLimit) {
    return createResultError(op, "The stream event limit must be between 1 and 100.")
  }
  return createResult(undefined)
}

function streamReplayClientStateCreate(options: StreamReplayClientOptions): StreamReplayClientState {
  const lastSequence = options.afterSequence ?? 0
  const lastEventId = options.afterEventId ?? null
  const eventSequences = new Map<string, number>()
  const sequenceEventIds = new Map<number, string>()
  if (lastEventId !== null) {
    eventSequences.set(lastEventId, lastSequence)
    sequenceEventIds.set(lastSequence, lastEventId)
  }
  return {
    eventSequences,
    lastEventId,
    lastSequence,
    sequenceEventIds,
    seenSequences: new Set<number>(),
    terminalEvent: null,
  }
}

function streamReplayClientUrl(
  options: StreamReplayClientOptions,
  afterEventId: string | null,
  limit: number | undefined,
): string {
  const base = (options.apiBase ?? "/api").replace(/\/+$/, "")
  const url = `${base}/sessions/${encodeURIComponent(options.sessionId)}/streams/${encodeURIComponent(options.streamId)}/events`
  const query = new URLSearchParams()
  if (afterEventId !== null) query.set("afterEventId", afterEventId)
  if (limit !== undefined) query.set("limit", String(limit))
  const encodedQuery = query.toString()
  return encodedQuery.length === 0 ? url : `${url}?${encodedQuery}`
}

function streamReplayClientSseRecordComplete(
  id: string | undefined,
  event: string | undefined,
  data: Array<string>,
  records: Array<StreamReplayClientSseRecord>,
): Result<void> {
  if (id === undefined && event === undefined && data.length === 0) return createResult(undefined)
  if (
    id === undefined ||
    id.length === 0 ||
    id.length > streamReplayClientMaxEventIdLength ||
    /[\r\n]/.test(id) ||
    event === undefined ||
    event.length === 0 ||
    event.length > streamReplayClientMaxEventTypeLength ||
    /[\r\n]/.test(event) ||
    data.length === 0
  ) {
    return createResultError("streamReplayClientReplay", "The stream replay event is invalid.")
  }

  records.push({ data: data.join("\n"), event, id })
  return createResult(undefined)
}

function streamReplayClientSseParse(text: string): Result<Array<StreamReplayClientSseRecord>> {
  const records: Array<StreamReplayClientSseRecord> = []
  let data: Array<string> = []
  let event: string | undefined
  let id: string | undefined

  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
    if (line === "") {
      const complete = streamReplayClientSseRecordComplete(id, event, data, records)
      if (!complete.success) return complete
      data = []
      event = undefined
      id = undefined
      continue
    }
    if (line.startsWith(":")) continue

    const separator = line.indexOf(":")
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? "" : line.slice(separator + 1)
    if (value.startsWith(" ")) value = value.slice(1)

    if (field === "data") data.push(value)
    if (field === "event") event = value
    if (field === "id") id = value
  }

  const complete = streamReplayClientSseRecordComplete(id, event, data, records)
  if (!complete.success) return complete
  return createResult(records)
}

function streamReplayClientJsonParse(value: string): Result<unknown> {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson()), value)
  if (!parsed.success) return createResultError("streamReplayClientReplay", "The stream replay JSON is invalid.")
  return createResult(parsed.output)
}

function streamReplayClientEventParse(
  record: StreamReplayClientSseRecord,
): Result<StreamReplayClientEventWithoutSequence> {
  const payload = streamReplayClientJsonParse(record.data)
  if (!payload.success) return payload

  if (streamReplayClientExecutionEventTypes.has(record.event)) {
    const parsed = v.safeParse(executionStreamEventSchema, {
      eventType: record.event,
      payload: payload.data,
    })
    if (!parsed.success)
      return createResultError("streamReplayClientReplay", "The stream replay event payload is invalid.")
  }

  return createResult({ eventType: record.event, id: record.id, payload: payload.data })
}

function streamReplayClientTerminalResolve(event: StreamReplayClientEvent): StreamReplayClientEvent | null {
  if (event.eventType === "terminal" || event.eventType === "RUN_ERROR" || event.eventType === "RUN_FINISHED") {
    return event
  }
  return null
}

function streamReplayClientResponseError(response: Response, body: string): Result<never> {
  const op = "streamReplayClientReplay"
  const parsedBody = streamReplayClientJsonParse(body)
  if (parsedBody.success) {
    const streamError = v.safeParse(streamApiErrorResponseSchema, parsedBody.data)
    if (streamError.success) {
      const result = createResultErrorCode(op, streamError.output.error.message, streamError.output.error.code)
      result.statusCode = response.status
      return result
    }

    const apiError = v.safeParse(apiErrorResponseSchema, parsedBody.data)
    if (apiError.success) {
      const result = createResultErrorCode(op, apiError.output.error.message, apiError.output.error.code)
      result.statusCode = response.status
      return result
    }
  }

  const result = streamReplayClientError(op, `The stream replay request failed with HTTP ${response.status}.`)
  result.statusCode = response.status
  return result
}

async function streamReplayClientResponseLoad(
  options: StreamReplayClientOptions,
  input: StreamReplayClientReplayOptions,
  afterEventId: string | null,
): Promise<Result<string>> {
  const op = "streamReplayClientReplay"
  const fetcher =
    options.fetcher ?? ((request: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(request, init))
  const url = streamReplayClientUrl(options, afterEventId, input.limit)

  let response: Response
  try {
    response = await fetcher(url, {
      headers: { Accept: "text/event-stream" },
      method: "GET",
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
  } catch (_error) {
    return streamReplayClientError(op, "The stream replay request could not be loaded.")
  }

  let body: string
  try {
    body = await response.text()
  } catch (_error) {
    return streamReplayClientError(op, "The stream replay response could not be read.")
  }
  if (!response.ok) return streamReplayClientResponseError(response, body)
  return createResult(body)
}

function streamReplayClientEventsCollect(
  records: Array<StreamReplayClientSseRecord>,
  afterSequence: number,
  hasCursor: boolean,
  state: StreamReplayClientState,
): Result<Array<StreamReplayClientEvent>> {
  const parsedEvents: Array<StreamReplayClientEventWithoutSequence> = []
  for (const record of records) {
    const parsed = streamReplayClientEventParse(record)
    if (!parsed.success) return parsed
    parsedEvents.push(parsed.data)
  }

  const events: Array<StreamReplayClientEvent> = []
  let nextSequence = hasCursor ? Math.max(afterSequence + 1, state.lastSequence + 1) : 1
  let highestSequence = state.lastSequence
  let highestEventId: string | undefined
  for (const [index, parsed] of parsedEvents.entries()) {
    let sequence = state.eventSequences.get(parsed.id)
    if (sequence === undefined && hasCursor) {
      sequence = nextSequence
      state.eventSequences.set(parsed.id, sequence)
    }
    if (sequence === undefined) {
      sequence = index + 1
      state.eventSequences.set(parsed.id, sequence)
    }
    state.sequenceEventIds.set(sequence, parsed.id)
    if (sequence >= nextSequence) nextSequence = sequence + 1
    if (sequence > highestSequence) {
      highestSequence = sequence
      highestEventId = parsed.id
    }
    if (sequence <= afterSequence || state.seenSequences.has(sequence)) continue

    const event = { ...parsed, sequence }
    state.seenSequences.add(sequence)
    events.push(event)
    const terminal = streamReplayClientTerminalResolve(event)
    if (terminal !== null && state.terminalEvent === null) state.terminalEvent = terminal
  }

  events.sort((left, right) => left.sequence - right.sequence)
  const previousSequence = state.lastSequence
  state.lastSequence = Math.max(state.lastSequence, highestSequence)
  if (highestSequence > previousSequence && highestEventId !== undefined) state.lastEventId = highestEventId
  return createResult(events)
}

function streamReplayClientResultCreate(state: StreamReplayClientState, events: Array<StreamReplayClientEvent>) {
  return createResult<StreamReplayClientReplay>({
    events,
    lastEventId: state.lastEventId,
    lastSequence: state.lastSequence,
    outcome: state.terminalEvent === null ? "active" : "terminal",
    terminalEvent: state.terminalEvent,
  })
}

export function streamReplayClientCreate(options: StreamReplayClientOptions) {
  const state = streamReplayClientStateCreate(options)

  const replay = async (input: StreamReplayClientReplayOptions = {}): Promise<Result<StreamReplayClientReplay>> => {
    const valid = streamReplayClientOptionsValidate(options, input)
    if (!valid.success) return valid
    if (state.terminalEvent !== null) return streamReplayClientResultCreate(state, [])

    const requestedEventSequence =
      input.afterEventId === undefined ? undefined : state.eventSequences.get(input.afterEventId)
    if (input.afterEventId !== undefined && input.afterSequence === undefined && requestedEventSequence === undefined) {
      return createResultError("streamReplayClientReplay", "The stream event cursor requires a known sequence.")
    }
    if (
      input.afterEventId !== undefined &&
      input.afterSequence !== undefined &&
      requestedEventSequence !== undefined &&
      requestedEventSequence !== input.afterSequence
    ) {
      return createResultError("streamReplayClientReplay", "The stream event cursor does not match its known sequence.")
    }
    const afterSequence = input.afterSequence ?? requestedEventSequence ?? state.lastSequence
    const afterEventId = input.afterEventId ?? state.sequenceEventIds.get(afterSequence) ?? null
    if (afterEventId !== null && !state.eventSequences.has(afterEventId)) {
      state.eventSequences.set(afterEventId, afterSequence)
    }

    const response = await streamReplayClientResponseLoad(options, input, afterEventId)
    if (!response.success) return response
    const records = streamReplayClientSseParse(response.data)
    if (!records.success) return records
    const events = streamReplayClientEventsCollect(records.data, afterSequence, afterEventId !== null, state)
    if (!events.success) return events
    return streamReplayClientResultCreate(state, events.data)
  }

  return { replay }
}
