import * as v from "valibot"

const serverFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const serverListResponseSchema = v.strictObject({
  servers: v.array(
    v.strictObject({
      id: serverFieldSchema,
      name: serverFieldSchema,
    }),
  ),
})

export type ServerListResponse = v.InferOutput<typeof serverListResponseSchema>
