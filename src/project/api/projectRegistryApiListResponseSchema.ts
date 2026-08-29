import * as v from "valibot"
import { projectRegistryApiProjectSchema } from "./projectRegistryApiProjectSchema.js"

export const projectRegistryApiListResponseSchema = v.strictObject({
  projects: v.array(projectRegistryApiProjectSchema),
  truncated: v.literal(false),
})

export type ProjectRegistryApiListResponse = v.InferOutput<typeof projectRegistryApiListResponseSchema>
