import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"

const projectApiListProjectSchema = v.strictObject({
  id: v.pipe(v.string(), v.maxLength(128)),
  label: v.pipe(v.string(), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
})

export const projectApiListResponseSchema = v.strictObject({
  projects: v.pipe(v.array(projectApiListProjectSchema), v.maxLength(projectDiscoveryLimits.maximumProjects)),
  truncated: v.boolean(),
})

export type ProjectApiListResponse = v.InferOutput<typeof projectApiListResponseSchema>
