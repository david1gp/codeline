import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { type JournalJsonValue, journalJsonValueSchema } from "../../journal/schema/journalJsonValueSchema.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionHistoryEntryPositionAllocate } from "./sessionHistoryEntryPositionAllocate.js"
import { sessionHistoryEntryTable } from "./sessionHistoryEntryTable.js"

const sessionHistoryEntryRepositoryUpsertInputSchema = v.strictObject({
  id: v.optional(v.pipe(v.string(), v.minLength(1))),
  kind: v.picklist(["message", "run", "tool"]),
  payload: journalJsonValueSchema,
  sourceDetailId: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.minLength(1), v.maxLength(256))])),
  sourceId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  sourceType: v.picklist(["message", "run", "tool"]),
})

type SessionHistoryEntryRepositoryUpsertResult = {
  changed: boolean
  created: boolean
  entry: typeof sessionHistoryEntryTable.$inferSelect
}

function sessionHistoryEntryPayloadCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(sessionHistoryEntryPayloadCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${sessionHistoryEntryPayloadCanonicalize((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`
}

export async function sessionHistoryEntryRepositoryUpsert(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: unknown,
): Promise<Result<SessionHistoryEntryRepositoryUpsertResult>> {
  const op = "sessionHistoryEntryRepositoryUpsert"
  const parsedInput = v.safeParse(sessionHistoryEntryRepositoryUpsertInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The session history entry input is invalid.")
  if (parsedInput.output.kind !== parsedInput.output.sourceType)
    return createResultError(op, "The session history entry kind and source type must match.")

  const sourceDetailId = parsedInput.output.sourceDetailId ?? ""
  const payload = parsedInput.output.payload as JournalJsonValue
  try {
    const [existing] = await database
      .select()
      .from(sessionHistoryEntryTable)
      .where(
        and(
          eq(sessionHistoryEntryTable.userId, userId),
          eq(sessionHistoryEntryTable.sessionId, sessionId),
          eq(sessionHistoryEntryTable.sourceType, parsedInput.output.sourceType),
          eq(sessionHistoryEntryTable.sourceId, parsedInput.output.sourceId),
          eq(sessionHistoryEntryTable.sourceDetailId, sourceDetailId),
        ),
      )
      .limit(1)

    if (existing !== undefined) {
      if (
        existing.kind !== parsedInput.output.kind ||
        (parsedInput.output.id !== undefined && existing.id !== parsedInput.output.id)
      )
        return createResultError(op, "The session history entry source identity conflicts with the existing entry.")
      if (sessionHistoryEntryPayloadCanonicalize(existing.payload) === sessionHistoryEntryPayloadCanonicalize(payload))
        return createResult({ changed: false, created: false, entry: existing })
      if (existing.kind === "message") return createResultError(op, "The message history entry is immutable.")

      const position = await sessionHistoryEntryPositionAllocate(database, userId, sessionId)
      if (!position.success) return position
      const [entry] = await database
        .update(sessionHistoryEntryTable)
        .set({
          changePosition: position.data,
          payload,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sessionHistoryEntryTable.id, existing.id),
            eq(sessionHistoryEntryTable.userId, userId),
            eq(sessionHistoryEntryTable.sessionId, sessionId),
          ),
        )
        .returning()
      if (entry === undefined) return createResultError(op, "The session history entry could not be updated.")
      return createResult({ changed: true, created: false, entry })
    }

    const position = await sessionHistoryEntryPositionAllocate(database, userId, sessionId)
    if (!position.success) return position
    const [entry] = await database
      .insert(sessionHistoryEntryTable)
      .values({
        id: parsedInput.output.id ?? uuidv7(),
        kind: parsedInput.output.kind,
        payload,
        position: position.data,
        sourceDetailId,
        sourceId: parsedInput.output.sourceId,
        sourceType: parsedInput.output.sourceType,
        userId,
        sessionId,
        changePosition: position.data,
      })
      .returning()
    if (entry === undefined) return createResultError(op, "The session history entry could not be created.")
    return createResult({ changed: true, created: true, entry })
  } catch (_error) {
    return createResultError(op, "The session history entry could not be saved.")
  }
}
