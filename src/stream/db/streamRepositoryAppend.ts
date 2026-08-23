import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { streamEventTable } from "./streamEventTable.js"

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type StreamRepositoryAppendResult = {
  created: boolean
  event: typeof streamEventTable.$inferSelect
}

function jsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

function jsonValueParse(value: unknown): Result<JsonValue> {
  const op = "streamRepositoryAppend"
  try {
    if (value === null || typeof value === "string" || typeof value === "boolean") return createResult(value)
    if (typeof value === "number" && Number.isFinite(value)) return createResult(value)
    if (Array.isArray(value) && value.every((entry) => jsonValueParse(entry).success))
      return createResult(value as JsonValue)
    if (typeof value === "object" && value !== null) {
      const prototype = Object.getPrototypeOf(value)
      if (
        (prototype === Object.prototype || prototype === null) &&
        Object.values(value).every((entry) => jsonValueParse(entry).success)
      ) {
        return createResult(value as JsonValue)
      }
    }
  } catch (_error) {
    return createResultError(op, "The stream event payload must be valid JSON.")
  }
  return createResultError(op, "The stream event payload must be valid JSON.")
}

function streamEventMatches(
  event: typeof streamEventTable.$inferSelect,
  input: {
    eventType: string
    payload: JsonValue
    sequence: number
    streamId: string
  },
): boolean {
  return (
    event.streamId === input.streamId &&
    event.sequence === input.sequence &&
    event.eventType === input.eventType &&
    jsonCanonicalize(event.payload) === jsonCanonicalize(input.payload)
  )
}

export async function streamRepositoryAppend(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: {
    eventType: string
    idempotencyKey: string
    payload: unknown
    sequence: number
    streamId: string
  },
): Promise<Result<{ created: boolean; event: typeof streamEventTable.$inferSelect }>> {
  const op = "streamRepositoryAppend"
  if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0) {
    return createResultError(op, "The stream event sequence must be a positive integer.")
  }
  if (input.streamId.length === 0 || input.eventType.length === 0 || input.idempotencyKey.length === 0) {
    return createResultError(op, "The stream event identifiers and type are required.")
  }
  const payload = jsonValueParse(input.payload)
  if (!payload.success) return payload

  return databaseExecutorTransactionRun<StreamRepositoryAppendResult>(database, async (executor) => {
    try {
      const [session] = await executor
        .select({ archivedAt: sessionTable.archivedAt })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")

      const [idempotent] = await executor
        .select()
        .from(streamEventTable)
        .where(
          and(
            eq(streamEventTable.sessionId, sessionId),
            eq(streamEventTable.streamId, input.streamId),
            eq(streamEventTable.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)
      if (idempotent !== undefined) {
        if (idempotent.sessionId === sessionId && streamEventMatches(idempotent, { ...input, payload: payload.data })) {
          return createResult({ created: false, event: idempotent })
        }
        return createResultError(op, "The stream event idempotency key conflicts with an existing event.")
      }
      if (session.archivedAt !== null) return createResultError(op, "The session is archived.")

      const [sequenced] = await executor
        .select()
        .from(streamEventTable)
        .where(
          and(
            eq(streamEventTable.sessionId, sessionId),
            eq(streamEventTable.streamId, input.streamId),
            eq(streamEventTable.sequence, input.sequence),
          ),
        )
        .limit(1)
      if (sequenced !== undefined)
        return createResultError(op, "The stream event sequence conflicts with an existing event.")

      const [created] = await executor
        .insert(streamEventTable)
        .values({
          eventType: input.eventType,
          id: uuidv7(),
          idempotencyKey: input.idempotencyKey,
          payload: payload.data,
          sequence: input.sequence,
          sessionId,
          streamId: input.streamId,
        })
        .onConflictDoNothing()
        .returning()
      if (created !== undefined) return createResult({ created: true, event: created })

      const [idempotentRetry] = await executor
        .select()
        .from(streamEventTable)
        .where(
          and(
            eq(streamEventTable.sessionId, sessionId),
            eq(streamEventTable.streamId, input.streamId),
            eq(streamEventTable.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)
      if (idempotentRetry !== undefined) {
        if (
          idempotentRetry.sessionId === sessionId &&
          streamEventMatches(idempotentRetry, { ...input, payload: payload.data })
        ) {
          return createResult({ created: false, event: idempotentRetry })
        }
        return createResultError(op, "The stream event idempotency key conflicts with an existing event.")
      }

      const [sequencedRetry] = await executor
        .select()
        .from(streamEventTable)
        .where(
          and(
            eq(streamEventTable.sessionId, sessionId),
            eq(streamEventTable.streamId, input.streamId),
            eq(streamEventTable.sequence, input.sequence),
          ),
        )
        .limit(1)
      if (sequencedRetry !== undefined)
        return createResultError(op, "The stream event sequence conflicts with an existing event.")

      return createResultError(op, "The stream event could not be appended.")
    } catch (_error) {
      return createResultError(op, "The stream event could not be appended.")
    }
  })
}
