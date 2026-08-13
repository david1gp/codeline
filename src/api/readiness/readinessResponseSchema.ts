import * as v from "valibot"

export const readinessResponseSchema = v.object({
  database: v.picklist(["ready", "not_ready"]),
  service: v.literal("codeline"),
  status: v.picklist(["ready", "not_ready"]),
})

export type ReadinessResponse = v.InferOutput<typeof readinessResponseSchema>
