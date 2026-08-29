import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"
import { projectIdSchema } from "../projectIdSchema.js"

export const projectRegistryApiProjectSchema = v.strictObject({
  available: v.boolean(),
  id: projectIdSchema,
  label: v.pipe(v.string(), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
})

export type ProjectRegistryApiProject = v.InferOutput<typeof projectRegistryApiProjectSchema>
