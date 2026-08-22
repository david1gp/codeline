import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"

export const sessionDeleteResponseSchema = v.strictObject({
  deleted: v.literal(true),
  session: v.strictObject({
    id: apiPublicIdSchema,
    revision: apiRevisionSchema,
  }),
})

export type SessionDeleteResponse = v.InferOutput<typeof sessionDeleteResponseSchema>
