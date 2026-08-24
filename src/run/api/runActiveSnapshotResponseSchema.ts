import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"

export const runActiveSnapshotResponseSchema = v.strictObject({
  /**
   * Opaque same-user feed cursor for `lastSequence`, so a reloaded tab attaches
   * `/api/events` after the folded output instead of replaying from an arbitrary
   * cursor. It is null when the run has no persisted deltas yet.
   */
  lastCursor: v.optional(v.nullable(apiCursorSchema)),
  lastSequence: apiSequenceSchema,
  partialText: v.string(),
  // Reconciliation may observe a terminal transition, so terminal statuses are intentional here.
  status: runStatusSchema,
})

export type RunActiveSnapshotResponse = v.InferOutput<typeof runActiveSnapshotResponseSchema>
