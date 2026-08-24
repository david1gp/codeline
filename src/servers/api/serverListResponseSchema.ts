import * as v from "valibot"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"

const serverFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const serverListResponseSchema = v.strictObject({
  etag: apiEtagSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  servers: v.array(
    v.strictObject({
      id: serverFieldSchema,
      name: serverFieldSchema,
    }),
  ),
})

export type ServerListResponse = v.InferOutput<typeof serverListResponseSchema>
