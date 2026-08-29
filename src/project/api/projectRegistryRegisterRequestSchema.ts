import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"

export const projectRegistryRegisterRequestSchema = v.strictObject({
  displayName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(projectDiscoveryLimits.maximumLabelLength))),
  path: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4096)),
})

export type ProjectRegistryRegisterRequest = v.InferOutput<typeof projectRegistryRegisterRequestSchema>
