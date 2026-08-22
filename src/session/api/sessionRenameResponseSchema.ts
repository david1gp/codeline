import * as v from "valibot"
import { sessionDetailResponseSchema } from "./sessionDetailResponseSchema.js"

export const sessionRenameResponseSchema = sessionDetailResponseSchema

export type SessionRenameResponse = v.InferOutput<typeof sessionDetailResponseSchema>
