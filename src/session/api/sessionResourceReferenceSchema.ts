import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const sessionResourceReferenceSchema = v.strictObject({
  id: apiPublicIdSchema,
})

export type SessionResourceReference = v.InferOutput<typeof sessionResourceReferenceSchema>
