import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { noteDocumentPublic } from "./noteDocumentPublic.js"
import type { NoteRecord } from "./noteRecord.js"

type NoteQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function noteLoad(
  context: NoteQueryContext,
  userId: string,
  noteId: string,
): Promise<Result<NoteRecord | undefined>> {
  const op = "noteLoad"
  try {
    const note = await context.db
      .query("notes")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", noteId))
      .first()
    if (note === null) return createResult(undefined)
    return createResult(noteDocumentPublic(note))
  } catch (_error) {
    return createResultError(op, "The note could not be loaded.")
  }
}
