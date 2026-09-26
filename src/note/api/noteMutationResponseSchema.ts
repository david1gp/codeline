import * as v from "valibot"
import { noteApiRecordSchema } from "./noteApiRecordSchema.js"

export const noteMutationResponseSchema = noteApiRecordSchema

export type NoteMutationResponse = v.InferOutput<typeof noteMutationResponseSchema>
