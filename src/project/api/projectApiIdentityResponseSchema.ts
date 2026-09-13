import * as v from "valibot"
import { projectDiscoveryLimits } from "../actions/projectDiscoveryLimits.js"
import { projectDiscoveryIdSchema } from "../schema/projectDiscoveryIdSchema.js"
import { projectIdSchema } from "../schema/projectIdSchema.js"

export const projectApiIdentityResponseSchema = v.strictObject({
  id: v.union([projectIdSchema, projectDiscoveryIdSchema]),
  label: v.pipe(v.string(), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
})

export type ProjectApiIdentityResponse = v.InferOutput<typeof projectApiIdentityResponseSchema>
