import * as v from "valibot"
import { projectDiscoveryIdSchema } from "../schema/projectDiscoveryIdSchema.js"

export const projectDiscoveryApiProjectQuerySchema = v.strictObject({
  project: projectDiscoveryIdSchema,
})

export type ProjectDiscoveryApiProjectQuery = v.InferOutput<typeof projectDiscoveryApiProjectQuerySchema>
