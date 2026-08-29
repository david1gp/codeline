import * as v from "valibot"
import { projectDiscoveryIdSchema } from "../projectDiscoveryIdSchema.js"

export const projectDiscoveryApiProjectQuerySchema = v.strictObject({
  project: projectDiscoveryIdSchema,
})

export type ProjectDiscoveryApiProjectQuery = v.InferOutput<typeof projectDiscoveryApiProjectQuerySchema>
