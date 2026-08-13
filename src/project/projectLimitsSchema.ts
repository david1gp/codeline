import * as v from "valibot"

export const projectLimitsSchema = v.object({
  maxDirectoryEntries: v.optional(v.number()),
  maxTextFileSizeBytes: v.optional(v.number()),
  maxDownloadFileSizeBytes: v.optional(v.number()),
})

export type ProjectLimits = v.InferInput<typeof projectLimitsSchema>
