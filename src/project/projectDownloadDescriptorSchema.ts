import * as v from "valibot"

export const projectDownloadDescriptorSchema = v.object({
  path: v.string(),
  name: v.string(),
  size: v.number(),
  modifiedAt: v.date(),
})

export type ProjectDownloadDescriptorData = v.InferOutput<typeof projectDownloadDescriptorSchema>
