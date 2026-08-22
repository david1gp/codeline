import * as v from "valibot"
import { apiIdempotencyKeySchema } from "./apiIdempotencyKeySchema.js"

export const apiIdempotencyResultSchema = v.strictObject({
  idempotencyKey: apiIdempotencyKeySchema,
  replayed: v.boolean(),
  // The generic envelope cannot know an operation's response shape. Use apiIdempotencyResultSchemaCreate for it.
  responseBody: v.unknown(),
  status: v.pipe(v.number(), v.integer(), v.minValue(200), v.maxValue(299)),
})

export type ApiIdempotencyResult = v.InferOutput<typeof apiIdempotencyResultSchema>
