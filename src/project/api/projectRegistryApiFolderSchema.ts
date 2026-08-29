import * as v from "valibot"
import { projectFolderIdSchema } from "../projectFolderIdSchema.js"

export const projectRegistryApiFolderSchema = v.strictObject({
  active: v.boolean(),
  id: projectFolderIdSchema,
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  unseenEnded: v.boolean(),
})

export type ProjectRegistryApiFolder = v.InferOutput<typeof projectRegistryApiFolderSchema>
