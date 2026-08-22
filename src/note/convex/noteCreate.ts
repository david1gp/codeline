import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { noteDocumentPublic } from "./noteDocumentPublic.js"
import type { NoteRecord } from "./noteRecord.js"
import { noteRowsCompact } from "./noteRowsCompact.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteRowsRead } from "./noteRowsRead.js"

type NoteMutationContext = Pick<GenericMutationCtx<any>, "db">

const noteCreateInputSchema = v.object({
  content: v.string(),
  createdAt: v.number(),
  id: v.pipe(v.string(), v.minLength(1)),
  projectPath: v.nullable(v.string()),
  updatedAt: v.number(),
})

export async function noteCreate(
  context: NoteMutationContext,
  userId: string,
  input: unknown,
): Promise<Result<NoteRecord>> {
  const op = "noteCreate"
  const parsed = v.safeParse(noteCreateInputSchema, input)
  if (!parsed.success) return createResultError(op, "The note creation input is invalid.")

  try {
    const existing = await context.db
      .query("notes")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", parsed.output.id))
      .first()
    if (existing !== null) return createResultError(op, "The note already exists.")

    const notes = await noteRowsRead(context, userId)
    const projectNotes = noteRowsOrder(notes, parsed.output.projectPath)
    await noteRowsCompact(context, projectNotes)
    const fields = {
      content: parsed.output.content,
      createdAt: parsed.output.createdAt,
      id: parsed.output.id,
      sortOrder: projectNotes.length,
      updatedAt: parsed.output.updatedAt,
      userId,
      ...(parsed.output.projectPath === null ? {} : { projectPath: parsed.output.projectPath }),
    }
    await context.db.insert("notes", fields)
    return createResult(noteDocumentPublic(fields))
  } catch (_error) {
    return createResultError(op, "The note could not be created.")
  }
}
