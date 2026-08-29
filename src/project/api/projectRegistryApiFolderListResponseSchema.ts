import * as v from "valibot"
import { projectRegistryApiFolderSchema } from "./projectRegistryApiFolderSchema.js"

export const projectRegistryApiFolderListResponseSchema = v.strictObject({
  folders: v.array(projectRegistryApiFolderSchema),
})

export type ProjectRegistryApiFolderListResponse = v.InferOutput<typeof projectRegistryApiFolderListResponseSchema>
