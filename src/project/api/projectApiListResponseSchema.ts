import * as v from "valibot"
import { projectDiscoveryIdSchema } from "../projectDiscoveryIdSchema.js"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"
import { projectRegistryApiProjectSchema } from "./projectRegistryApiProjectSchema.js"

const projectApiListProjectSchema = v.union([
  v.strictObject({
    id: projectDiscoveryIdSchema,
    label: v.pipe(v.string(), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
  }),
  projectRegistryApiProjectSchema,
])

export const projectApiListResponseSchema = v.strictObject({
  projects: v.pipe(v.array(projectApiListProjectSchema), v.maxLength(projectDiscoveryLimits.maximumProjects)),
  truncated: v.boolean(),
})

export type ProjectApiListResponse = v.InferOutput<typeof projectApiListResponseSchema>
