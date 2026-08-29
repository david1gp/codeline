import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"

export const projectRegistryFolderRequestSchema = v.strictObject({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
})

export type ProjectRegistryFolderRequest = v.InferOutput<typeof projectRegistryFolderRequestSchema>
