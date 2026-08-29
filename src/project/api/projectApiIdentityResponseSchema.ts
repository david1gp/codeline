import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"
import { projectDiscoveryIdSchema } from "../projectDiscoveryIdSchema.js"
import { projectIdSchema } from "../projectIdSchema.js"

export const projectApiIdentityResponseSchema = v.strictObject({
  id: v.union([projectIdSchema, projectDiscoveryIdSchema]),
  label: v.pipe(v.string(), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
})

export type ProjectApiIdentityResponse = v.InferOutput<typeof projectApiIdentityResponseSchema>
