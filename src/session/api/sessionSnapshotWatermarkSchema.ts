import type * as v from "valibot"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"

export const sessionSnapshotWatermarkSchema = apiSequenceSchema

export type SessionSnapshotWatermark = v.InferOutput<typeof sessionSnapshotWatermarkSchema>
