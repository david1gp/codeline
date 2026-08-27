import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"

export const projectApiIdentityResponseSchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  label: v.pipe(v.string(), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
})

export type ProjectApiIdentityResponse = v.InferOutput<typeof projectApiIdentityResponseSchema>
