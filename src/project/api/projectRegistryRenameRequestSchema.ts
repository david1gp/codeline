import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"

export const projectRegistryRenameRequestSchema = v.strictObject({
  displayName: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(projectDiscoveryLimits.maximumLabelLength))),
})

export type ProjectRegistryRenameRequest = v.InferOutput<typeof projectRegistryRenameRequestSchema>
