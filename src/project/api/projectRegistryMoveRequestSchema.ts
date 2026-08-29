import * as v from "valibot"
import { projectFolderIdSchema } from "../projectFolderIdSchema.js"

export const projectRegistryMoveRequestSchema = v.strictObject({
  folderId: v.nullable(projectFolderIdSchema),
})

export type ProjectRegistryMoveRequest = v.InferOutput<typeof projectRegistryMoveRequestSchema>
