import * as v from "valibot"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"

export const runActiveSnapshotResponseSchema = v.strictObject({
  lastSequence: apiSequenceSchema,
  partialText: v.string(),
  // Reconciliation may observe a terminal transition, so terminal statuses are intentional here.
  status: runStatusSchema,
})

export type RunActiveSnapshotResponse = v.InferOutput<typeof runActiveSnapshotResponseSchema>
