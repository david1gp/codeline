import * as v from "valibot"

const projectApiDirectoryEntrySchema = v.strictObject({
  name: v.string(),
  path: v.string(),
  type: v.picklist(["directory", "file", "other"]),
  size: v.number(),
  modifiedAt: v.pipe(v.string(), v.isoTimestamp()),
})

export const projectApiDirectoryResponseSchema = v.strictObject({
  entries: v.array(projectApiDirectoryEntrySchema),
})

export type ProjectApiDirectoryResponse = v.InferOutput<typeof projectApiDirectoryResponseSchema>
