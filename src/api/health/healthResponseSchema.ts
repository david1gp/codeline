import * as v from "valibot"

export const healthResponseSchema = v.object({
  service: v.literal("codeline"),
  status: v.literal("ok"),
})

export type HealthResponse = v.InferOutput<typeof healthResponseSchema>
