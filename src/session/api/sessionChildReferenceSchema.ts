import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const sessionChildReferenceSchema = v.strictObject({
  childRunId: apiPublicIdSchema,
  childSessionId: v.optional(v.nullable(apiPublicIdSchema)),
  delegationId: apiPublicIdSchema,
  parentSessionId: apiPublicIdSchema,
})

export type SessionChildReference = v.InferOutput<typeof sessionChildReferenceSchema>
