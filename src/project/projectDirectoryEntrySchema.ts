import * as v from "valibot"

export const projectDirectoryEntrySchema = v.object({
  name: v.string(),
  path: v.string(),
  type: v.picklist(["directory", "file", "other"]),
  size: v.number(),
  modifiedAt: v.date(),
})

export type ProjectDirectoryEntry = v.InferOutput<typeof projectDirectoryEntrySchema>
