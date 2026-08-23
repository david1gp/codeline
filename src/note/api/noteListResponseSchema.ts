import * as v from "valibot"
import { noteApiRecordSchema } from "./noteApiRecordSchema.js"

export const noteListResponseSchema = v.array(noteApiRecordSchema)

export type NoteListResponse = v.InferOutput<typeof noteListResponseSchema>
