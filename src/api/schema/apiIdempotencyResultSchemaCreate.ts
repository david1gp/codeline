import * as v from "valibot"
import { apiIdempotencyKeySchema } from "./apiIdempotencyKeySchema.js"

export function apiIdempotencyResultSchemaCreate<TResponseBodySchema extends v.GenericSchema>(
  responseBodySchema: TResponseBodySchema,
) {
  return v.strictObject({
    idempotencyKey: apiIdempotencyKeySchema,
    replayed: v.boolean(),
    responseBody: responseBodySchema,
    status: v.pipe(v.number(), v.integer(), v.minValue(200), v.maxValue(299)),
  })
}
