import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { noteDocumentPublic } from "./noteDocumentPublic.js"
import type { NoteRecord } from "./noteRecord.js"
import { noteRowsCompact } from "./noteRowsCompact.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteRowsRead } from "./noteRowsRead.js"

type NoteMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function noteDelete(
  context: NoteMutationContext,
  userId: string,
  noteId: string,
): Promise<Result<NoteRecord>> {
  const op = "noteDelete"
  try {
    const notes = await noteRowsRead(context, userId)
    const existing = notes.find((note) => note.id === noteId)
    if (existing === undefined) return createResultError(op, "The note could not be found.")
    const remaining = noteRowsOrder(notes, existing.projectPath ?? null).filter((note) => note.id !== existing.id)
    await noteRowsCompact(context, remaining)
    await context.db.delete("notes", existing._id)
    return createResult(noteDocumentPublic(existing))
  } catch (_error) {
    return createResultError(op, "The note could not be deleted.")
  }
}
