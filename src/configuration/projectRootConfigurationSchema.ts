import * as v from "valibot"
import { projectDiscoveryLimits } from "../project/projectDiscoveryLimits.js"

export const projectRootConfigurationSchema = v.pipe(
  v.array(v.pipe(v.string(), v.trim(), v.minLength(1))),
  v.maxLength(projectDiscoveryLimits.maximumRoots),
)

export type ProjectRootConfiguration = v.InferOutput<typeof projectRootConfigurationSchema>
