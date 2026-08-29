import * as v from "valibot"
import { projectIdSchema } from "../projectIdSchema.js"

export const projectApiProjectQuerySchema = v.strictObject({
  project: projectIdSchema,
})

export type ProjectApiProjectQuery = v.InferOutput<typeof projectApiProjectQuerySchema>
