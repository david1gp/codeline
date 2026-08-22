import type { GenericQueryCtx } from "convex/server"

type NoteQueryContext = Pick<GenericQueryCtx<any>, "db">

export function noteRowsRead(context: NoteQueryContext, userId: string): Promise<any[]> {
  return context.db
    .query("notes")
    .withIndex("userId", (query: any) => query.eq("userId", userId))
    .collect()
}
