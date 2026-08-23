import * as v from "valibot"
import { noteApiRecordSchema } from "./noteApiRecordSchema.js"

export const noteDetailResponseSchema = noteApiRecordSchema

export type NoteDetailResponse = v.InferOutput<typeof noteDetailResponseSchema>
