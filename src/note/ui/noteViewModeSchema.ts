import * as v from "valibot"

export const noteViewModeSchema = v.picklist(["edit", "preview", "split"])

export type NoteViewMode = v.InferOutput<typeof noteViewModeSchema>
