import * as v from "valibot"
import { projectIdSchema } from "../schema/projectIdSchema.js"

export const projectApiProjectQuerySchema = v.strictObject({
  project: projectIdSchema,
})

export type ProjectApiProjectQuery = v.InferOutput<typeof projectApiProjectQuerySchema>
