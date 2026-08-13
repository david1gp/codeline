import * as v from "valibot"

export const projectApiMetadataResponseSchema = v.strictObject({
  path: v.string(),
  name: v.string(),
  type: v.picklist(["directory", "file", "other"]),
  size: v.number(),
  modifiedAt: v.pipe(v.string(), v.isoTimestamp()),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  isReadOnly: v.boolean(),
})

export type ProjectApiMetadataResponse = v.InferOutput<typeof projectApiMetadataResponseSchema>
