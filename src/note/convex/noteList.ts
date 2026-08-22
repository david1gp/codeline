import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { noteDocumentPublic } from "./noteDocumentPublic.js"
import type { NoteRecord } from "./noteRecord.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteRowsRead } from "./noteRowsRead.js"

type NoteQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function noteList(context: NoteQueryContext, userId: string): Promise<Result<NoteRecord[]>> {
  const op = "noteList"
  try {
    const notes = await noteRowsRead(context, userId)
    return createResult(noteRowsOrder(notes).map(noteDocumentPublic))
  } catch (_error) {
    return createResultError(op, "The notes could not be loaded.")
  }
}
