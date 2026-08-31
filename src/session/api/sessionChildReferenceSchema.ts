import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const sessionChildReferenceSchema = v.strictObject({
  childSessionId: apiPublicIdSchema,
  parentSessionId: apiPublicIdSchema,
})

export type SessionChildReference = v.InferOutput<typeof sessionChildReferenceSchema>
