import * as v from "valibot"

export const projectMetadataSchema = v.object({
  path: v.string(),
  name: v.string(),
  type: v.picklist(["directory", "file", "other"]),
  size: v.number(),
  modifiedAt: v.date(),
  createdAt: v.date(),
  isReadOnly: v.boolean(),
})

export type ProjectMetadata = v.InferOutput<typeof projectMetadataSchema>
