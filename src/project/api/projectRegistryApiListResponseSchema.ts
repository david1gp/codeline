import * as v from "valibot"
import { projectRegistryApiFolderSchema } from "./projectRegistryApiFolderSchema.js"
import { projectRegistryApiProjectSchema } from "./projectRegistryApiProjectSchema.js"

export const projectRegistryApiListResponseSchema = v.strictObject({
  folders: v.array(projectRegistryApiFolderSchema),
  projects: v.array(projectRegistryApiProjectSchema),
  truncated: v.literal(false),
})

export type ProjectRegistryApiListResponse = v.InferOutput<typeof projectRegistryApiListResponseSchema>
