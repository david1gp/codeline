import * as v from "valibot"

const runSessionStreamSnapshotAttemptSchema = v.strictObject({
  id: v.string(),
  ordinal: v.pipe(v.number(), v.integer(), v.minValue(1)),
  status: v.string(),
  streamId: v.string(),
})

const runSessionStreamSnapshotRunSchema = v.strictObject({
  attempts: v.array(runSessionStreamSnapshotAttemptSchema),
  cancellationKind: v.nullable(v.string()),
  clientRunId: v.string(),
  createdAt: v.pipe(v.number(), v.integer()),
  id: v.string(),
  snapshot: v.unknown(),
  status: v.string(),
  streamId: v.string(),
})

const runSessionStreamSnapshotEventSchema = v.strictObject({
  createdAt: v.pipe(v.number(), v.integer()),
  eventType: v.string(),
  id: v.string(),
  payload: v.unknown(),
  sequence: v.pipe(v.number(), v.integer(), v.minValue(1)),
  streamId: v.string(),
})

export const runSessionStreamSnapshotResponseSchema = v.strictObject({
  events: v.array(runSessionStreamSnapshotEventSchema),
  runs: v.array(runSessionStreamSnapshotRunSchema),
})

export type RunSessionStreamSnapshotResponse = v.InferOutput<typeof runSessionStreamSnapshotResponseSchema>
