import * as v from "valibot"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"

export const sessionSnapshotWatermarkSchema = v.pipe(apiSequenceSchema, v.maxValue(Number.MAX_SAFE_INTEGER))

export type SessionSnapshotWatermark = v.InferOutput<typeof sessionSnapshotWatermarkSchema>
