import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { attemptStatusSchema } from "../schema/attemptStatusSchema.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"
import { runFailureMetadataSchema } from "../schema/runFailureMetadataSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"

const runSessionSnapshotAttemptSchema = v.strictObject({
  id: apiPublicIdSchema,
  ordinal: v.pipe(v.number(), v.integer(), v.minValue(1)),
  status: attemptStatusSchema,
  streamId: apiPublicIdSchema,
})

const runSessionSnapshotEventSchema = v.strictObject({
  attemptOrdinal: v.pipe(v.number(), v.integer(), v.minValue(1)),
  eventType: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  payload: v.unknown(),
  sequence: apiSequenceSchema,
  streamId: apiPublicIdSchema,
})

const runSessionSnapshotRunSchema = v.strictObject({
  attempts: v.array(runSessionSnapshotAttemptSchema),
  cancellationKind: v.nullable(runCancellationKindSchema),
  createdAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  failure: v.optional(v.nullable(runFailureMetadataSchema)),
  id: apiPublicIdSchema,
  status: runStatusSchema,
  streamId: apiPublicIdSchema,
})

export const runSessionSnapshotResponseSchema = v.strictObject({
  events: v.array(runSessionSnapshotEventSchema),
  runs: v.array(runSessionSnapshotRunSchema),
})

export type RunSessionSnapshotResponse = v.InferOutput<typeof runSessionSnapshotResponseSchema>
