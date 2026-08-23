import * as v from "valibot"
import { serverListResponseV2Schema } from "./serverListResponseV2Schema.js"

const serverFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

const serverListResponseLegacySchema = v.strictObject({
  servers: v.array(
    v.strictObject({
      id: serverFieldSchema,
      name: serverFieldSchema,
    }),
  ),
})

export const serverListResponseSchema = v.union([serverListResponseLegacySchema, serverListResponseV2Schema])

export type ServerListResponse = v.InferOutput<typeof serverListResponseSchema>
