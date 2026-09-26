import * as v from "valibot"
import { apiIdempotencyKeySchema } from "./apiIdempotencyKeySchema.js"

export const apiIdempotencyRequestSchema = v.strictObject({
  idempotencyKey: apiIdempotencyKeySchema,
})

export type ApiIdempotencyRequest = v.InferOutput<typeof apiIdempotencyRequestSchema>
