import * as v from "valibot"
import { projectRegistryApiProjectSchema } from "./projectRegistryApiProjectSchema.js"

export const projectRegistryApiProjectResponseSchema = v.strictObject({
  project: projectRegistryApiProjectSchema,
})

export type ProjectRegistryApiProjectResponse = v.InferOutput<typeof projectRegistryApiProjectResponseSchema>
