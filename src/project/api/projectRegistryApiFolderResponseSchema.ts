import * as v from "valibot"
import { projectRegistryApiFolderSchema } from "./projectRegistryApiFolderSchema.js"

export const projectRegistryApiFolderResponseSchema = v.strictObject({
  folder: projectRegistryApiFolderSchema,
})

export type ProjectRegistryApiFolderResponse = v.InferOutput<typeof projectRegistryApiFolderResponseSchema>
