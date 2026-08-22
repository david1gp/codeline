import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { noteDocumentPublic } from "./noteDocumentPublic.js"
import type { NoteRecord } from "./noteRecord.js"
import { noteRowsCompact } from "./noteRowsCompact.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteRowsRead } from "./noteRowsRead.js"

type NoteMutationContext = Pick<GenericMutationCtx<any>, "db">

const noteReorderInputSchema = v.object({
  direction: v.picklist(["up", "down"]),
  id: v.pipe(v.string(), v.minLength(1)),
  projectPath: v.nullable(v.string()),
})

export async function noteReorder(
  context: NoteMutationContext,
  userId: string,
  input: unknown,
): Promise<Result<NoteRecord | undefined>> {
  const op = "noteReorder"
  const parsed = v.safeParse(noteReorderInputSchema, input)
  if (!parsed.success) return createResultError(op, "The note reorder input is invalid.")

  try {
    const notes = await noteRowsRead(context, userId)
    const existing = notes.find((note) => note.id === parsed.output.id)
    if (existing === undefined) return createResultError(op, "The note could not be found.")
    if ((existing.projectPath ?? null) !== parsed.output.projectPath)
      return createResultError(op, "The note does not belong to the requested project.")

    const projectNotes = noteRowsOrder(notes, parsed.output.projectPath)
    const currentIndex = projectNotes.findIndex((note) => note.id === existing.id)
    await noteRowsCompact(context, projectNotes)
    const adjacentIndex = currentIndex + (parsed.output.direction === "up" ? -1 : 1)
    const adjacent = projectNotes[adjacentIndex]
    if (currentIndex < 0 || adjacent === undefined)
      return createResult({ ...noteDocumentPublic(existing), sortOrder: Math.max(0, currentIndex) })

    await context.db.patch("notes", adjacent._id, { sortOrder: currentIndex })
    await context.db.patch("notes", existing._id, { sortOrder: adjacentIndex })
    return createResult({ ...noteDocumentPublic(existing), sortOrder: adjacentIndex })
  } catch (_error) {
    return createResultError(op, "The note could not be reordered.")
  }
}
