import * as v from "valibot"

export const sessionSidebarNewOrderSchema = v.pipe(
  v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
  v.transform((ids) => [...new Set(ids)]),
)

export type SessionSidebarNewOrder = v.InferOutput<typeof sessionSidebarNewOrderSchema>
