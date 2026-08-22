import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { noteDocumentPublic } from "./noteDocumentPublic.js"
import type { NoteRecord } from "./noteRecord.js"
import { noteRowsCompact } from "./noteRowsCompact.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteRowsRead } from "./noteRowsRead.js"

type NoteMutationContext = Pick<GenericMutationCtx<any>, "db">

const noteUpdateInputSchema = v.object({
  content: v.string(),
  id: v.pipe(v.string(), v.minLength(1)),
  projectPath: v.nullable(v.string()),
  updatedAt: v.number(),
})

export async function noteUpdate(
  context: NoteMutationContext,
  userId: string,
  input: unknown,
): Promise<Result<NoteRecord>> {
  const op = "noteUpdate"
  const parsed = v.safeParse(noteUpdateInputSchema, input)
  if (!parsed.success) return createResultError(op, "The note update input is invalid.")

  try {
    const notes = await noteRowsRead(context, userId)
    const existing = notes.find((note) => note.id === parsed.output.id)
    if (existing === undefined) return createResultError(op, "The note could not be found.")
    const currentProjectPath = existing.projectPath ?? null
    const destinationProjectPath = parsed.output.projectPath
    const destinationNotes = noteRowsOrder(notes, destinationProjectPath).filter((note) => note.id !== existing.id)
    const sortOrder = destinationNotes.length

    if (currentProjectPath === destinationProjectPath) {
      const projectNotes = noteRowsOrder(notes, currentProjectPath)
      const currentIndex = projectNotes.findIndex((note) => note.id === existing.id)
      await noteRowsCompact(context, projectNotes)
      await context.db.patch("notes", existing._id, {
        content: parsed.output.content,
        sortOrder: currentIndex,
        updatedAt: parsed.output.updatedAt,
      })
      return createResult({
        ...noteDocumentPublic(existing),
        content: parsed.output.content,
        projectPath: destinationProjectPath,
        sortOrder: currentIndex,
        updatedAt: parsed.output.updatedAt,
      })
    }

    const sourceNotes = noteRowsOrder(notes, currentProjectPath).filter((note) => note.id !== existing.id)
    await noteRowsCompact(context, sourceNotes)
    await noteRowsCompact(context, destinationNotes)
    const fields = {
      content: parsed.output.content,
      createdAt: existing.createdAt,
      id: existing.id,
      sortOrder,
      updatedAt: parsed.output.updatedAt,
      userId,
      ...(destinationProjectPath === null ? {} : { projectPath: destinationProjectPath }),
    }
    await context.db.replace("notes", existing._id, fields)
    return createResult(noteDocumentPublic(fields))
  } catch (_error) {
    return createResultError(op, "The note could not be updated.")
  }
}
