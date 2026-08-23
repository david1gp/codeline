import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase } from "idb"
import * as v from "valibot"
import {
  type SessionSettledSnapshotResponse,
  sessionSettledSnapshotResponseSchema,
} from "../api/sessionSettledSnapshotResponseSchema.js"
import type { SessionSettledRecord } from "../schema/sessionSettledRecordSchema.js"
import { type SessionSettledDatabaseSchema } from "../storage/sessionSettledDatabaseSchema.js"
import { sessionSettledRecordRead } from "../storage/sessionSettledRecordRead.js"
import { sessionSettledRecordWrite } from "../storage/sessionSettledRecordWrite.js"

type SessionSettledCacheStatus = "error" | "loading" | "offline" | "ready" | "revalidating"

function sessionSettledCacheResponseRecordCreate(
  response: SessionSettledSnapshotResponse,
  userId: string,
  asOfSequenceResolve: (cursor: string) => number | undefined,
): Result<SessionSettledRecord> {
  const op = "sessionSettledCacheResponseRecordCreate"
  if (response.session.id.length === 0) return createResultError(op, "The settled session identifier is invalid.")
  const asOfSequence = response.asOfSequence ?? asOfSequenceResolve(response.asOfCursor)
  if (asOfSequence === undefined)
    return createResultError(op, "The settled session snapshot has no numeric sequence boundary.")

  return createResult({
    asOfSequence,
    etag: response.etag,
    payload: {
      messages: response.messages,
      session: response.session,
      settled: true,
    },
    revision: response.revision,
    schemaVersion: response.schemaVersion,
    sessionId: response.session.id,
    userId,
  })
}

function sessionSettledCacheResponseParse(body: string): Result<SessionSettledSnapshotResponse> {
  const op = "sessionSettledCacheResponseParse"
  let candidate: unknown
  try {
    candidate = JSON.parse(body) as unknown
  } catch (_error) {
    return createResultError(op, "The settled session snapshot response is not valid JSON.")
  }

  const parsed = v.safeParse(sessionSettledSnapshotResponseSchema, candidate)
  if (!parsed.success) return createResultError(op, "The settled session snapshot response is invalid.")
  return createResult(parsed.output)
}

export function sessionSettledCacheStateCreate(options: {
  database: IDBPDatabase<SessionSettledDatabaseSchema>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
  lastLocallyActiveUserId?: string | null
  sessionId: string
  userId: string | null
  asOfSequenceResolve?: (cursor: string) => number | undefined
}) {
  const fetcher = options.fetch ?? fetch
  const accountUserId = options.userId ?? options.lastLocallyActiveUserId ?? null
  const asOfSequenceResolve =
    options.asOfSequenceResolve ??
    ((cursor: string) => {
      const sequence = Number(cursor)
      return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : undefined
    })
  let record: SessionSettledRecord | undefined
  let status: SessionSettledCacheStatus = "loading"

  const state = () => ({ record, status })

  const load = async (): Promise<Result<SessionSettledRecord | undefined>> => {
    if (accountUserId === null) {
      record = undefined
      status = "ready"
      return createResult(undefined)
    }

    status = "loading"
    const loaded = await sessionSettledRecordRead(options.database, {
      sessionId: options.sessionId,
      userId: accountUserId,
    })
    if (!loaded.success) {
      status = "error"
      return loaded
    }
    record = loaded.data
    status = "ready"
    return createResult(record)
  }

  const revalidate = async (): Promise<Result<SessionSettledRecord | undefined>> => {
    if (options.userId === null || accountUserId === null) return createResult(record)
    if (options.isOnline?.() === false) {
      status = "offline"
      return createResult(record)
    }

    status = "revalidating"
    const headers = new Headers({ Accept: "application/json" })
    if (record !== undefined) headers.set("If-None-Match", record.etag)

    let response: Response
    try {
      response = await fetcher(`/api/sessions/${encodeURIComponent(options.sessionId)}/snapshot`, {
        headers,
        method: "GET",
      })
    } catch (_error) {
      status = "error"
      return createResultError("sessionSettledCacheRevalidate", "The settled session snapshot could not be loaded.")
    }

    const responseEtag = response.headers.get("ETag")
    if (response.status === 304) {
      if (record === undefined || (responseEtag !== null && responseEtag !== record.etag)) {
        status = "error"
        return createResultError("sessionSettledCacheRevalidate", "The settled session cache validation failed.")
      }
      status = "ready"
      return createResult(record)
    }
    if (response.status !== 200) {
      status = "error"
      return createResultError("sessionSettledCacheRevalidate", "The settled session snapshot could not be loaded.")
    }

    let body: string
    try {
      body = await response.text()
    } catch (_error) {
      status = "error"
      return createResultError("sessionSettledCacheRevalidate", "The settled session snapshot could not be read.")
    }
    const parsed = sessionSettledCacheResponseParse(body)
    if (!parsed.success) {
      status = "error"
      return parsed
    }
    if (parsed.data.session.id !== options.sessionId || parsed.data.session.revision !== parsed.data.revision) {
      status = "error"
      return createResultError(
        "sessionSettledCacheRevalidate",
        "The settled session snapshot belongs to another revision.",
      )
    }
    if (responseEtag !== null && responseEtag !== parsed.data.etag) {
      status = "error"
      return createResultError("sessionSettledCacheRevalidate", "The settled session snapshot ETag is inconsistent.")
    }

    const replacement = sessionSettledCacheResponseRecordCreate(parsed.data, accountUserId, asOfSequenceResolve)
    if (!replacement.success) {
      status = "error"
      return replacement
    }
    const written = await sessionSettledRecordWrite(options.database, replacement.data)
    if (!written.success) {
      status = "error"
      return written
    }
    record = replacement.data
    status = "ready"
    return createResult(record)
  }

  const completionReconcile = async (input: unknown): Promise<Result<void>> => {
    const parsed = v.safeParse(sessionSettledSnapshotResponseSchema, input)
    if (!parsed.success)
      return createResultError("sessionSettledCacheCompletionReconcile", "The completion snapshot is invalid.")
    if (options.userId === null || accountUserId === null || parsed.output.session.id !== options.sessionId)
      return createResultError(
        "sessionSettledCacheCompletionReconcile",
        "The completion snapshot belongs to another session.",
      )
    const replacement = sessionSettledCacheResponseRecordCreate(parsed.output, accountUserId, asOfSequenceResolve)
    if (!replacement.success) return replacement
    const written = await sessionSettledRecordWrite(options.database, replacement.data)
    if (!written.success) return written
    record = replacement.data
    status = "ready"
    return createResult(undefined)
  }

  const ready = (async () => {
    const loaded = await load()
    if (!loaded.success) return loaded
    return revalidate()
  })()

  return { completionReconcile, load, ready, revalidate, state }
}
