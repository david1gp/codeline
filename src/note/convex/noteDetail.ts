import type { GenericQueryCtx } from "convex/server"
import { noteLoad } from "./noteLoad.js"

type NoteQueryContext = Pick<GenericQueryCtx<any>, "db">

export function noteDetail(context: NoteQueryContext, userId: string, noteId: string) {
  return noteLoad(context, userId, noteId)
}
