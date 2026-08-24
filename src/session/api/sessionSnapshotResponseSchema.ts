import type * as v from "valibot"
import { sessionSettledSnapshotResponseSchema } from "./sessionSettledSnapshotResponseSchema.js"

export const sessionSnapshotResponseSchema = sessionSettledSnapshotResponseSchema

export type SessionSnapshotResponse = v.InferOutput<typeof sessionSnapshotResponseSchema>
