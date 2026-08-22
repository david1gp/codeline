import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, inArray, sql } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { journalEventTable } from "../db/journalEventTable.js"
import { type JournalEventAppendInput, journalEventAppendInputSchema } from "../schema/journalEventAppendInputSchema.js"
import type { JournalJsonValue } from "../schema/journalJsonValueSchema.js"
import { journalSequenceAllocate } from "./journalSequenceAllocate.js"

type JournalEventAppendResult = {
  events: Array<typeof journalEventTable.$inferSelect>
}

const journalTerminalEventTypes = ["run-completed", "run-failed", "run-cancelled", "run-interrupted"] as const

function journalEventPayloadObject(payload: JournalEventAppendInput["payload"]): Record<string, unknown> | undefined {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined
  return payload as Record<string, unknown>
}

function journalEventResourceMatchesPayload(input: JournalEventAppendInput): boolean {
  const payload = journalEventPayloadObject(input.payload)
  if (payload === undefined)
    return input.eventType !== "delta" && !journalTerminalEventTypes.includes(input.eventType as never)

  const resourceId = payload.resourceId
  if (typeof resourceId === "string" && resourceId !== input.resource.resourceId) return false

  if (input.eventType === "delta" || journalTerminalEventTypes.includes(input.eventType as never)) {
    if (input.resource.resourceType !== "run" || payload.runId !== input.resource.resourceId) return false
  }
  return true
}

function journalEventRunId(input: JournalEventAppendInput): string | undefined {
  if (input.eventType !== "delta" && !journalTerminalEventTypes.includes(input.eventType as never)) return undefined
  const payload = journalEventPayloadObject(input.payload)
  return typeof payload?.runId === "string" ? payload.runId : undefined
}

export async function journalEventsAppendPersist(
  database: DatabaseExecutor,
  input: JournalEventAppendInput,
  authorizedUserIds: readonly string[],
  locksAlreadyHeld: boolean,
): Promise<Result<JournalEventAppendResult>> {
  const op = "journalEventsAppendPersist"
  const parsedInput = v.safeParse(journalEventAppendInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The journal event input is invalid.")
  if (!journalEventResourceMatchesPayload(parsedInput.output))
    return createResultError(op, "The journal event payload does not match its resource.")

  const allocated = await journalSequenceAllocate(database, authorizedUserIds, { locksAlreadyHeld })
  if (!allocated.success) return createResultError(op, allocated.errorMessage)

  const runId = journalEventRunId(parsedInput.output)
  if (runId !== undefined) {
    try {
      await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${runId}, 0))`)
    } catch (_error) {
      return createResultError(op, "The journal run finalization lock could not be acquired.")
    }
  }

  if (parsedInput.output.eventType === "delta") {
    try {
      const terminal = await database
        .select({ id: journalEventTable.id })
        .from(journalEventTable)
        .where(
          and(
            inArray(journalEventTable.eventType, journalTerminalEventTypes),
            sql`${journalEventTable.payload}->>'runId' = ${runId}`,
          ),
        )
        .limit(1)
      if (terminal.length > 0) return createResultError(op, "The journal run has already been finalized.")
    } catch (_error) {
      return createResultError(op, "The journal run finalization state could not be checked.")
    }
  }

  try {
    const events: Array<typeof journalEventTable.$inferSelect> = []
    for (const userId of allocated.data.userIds) {
      const [event] = await database
        .insert(journalEventTable)
        .values({
          eventType: parsedInput.output.eventType,
          id: uuidv7(),
          payload: parsedInput.output.payload as JournalJsonValue,
          sequence: allocated.data.sequenceByUserId[userId] ?? 0,
          userId,
        })
        .returning()
      if (event === undefined) return createResultError(op, "The journal event could not be persisted.")
      events.push(event)
    }
    return createResult({ events })
  } catch (_error) {
    return createResultError(op, "The journal events could not be persisted.")
  }
}
