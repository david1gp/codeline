import type { GenericMutationCtx } from "convex/server"

type NoteMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function noteRowsCompact(context: NoteMutationContext, notes: readonly any[]): Promise<void> {
  for (const [sortOrder, note] of notes.entries()) {
    if (note.sortOrder === sortOrder) continue
    await context.db.patch("notes", note._id, { sortOrder })
  }
}
