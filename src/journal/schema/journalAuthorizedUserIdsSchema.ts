import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const journalAuthorizedUserIdsSchema = v.pipe(v.array(apiPublicIdSchema), v.minLength(1), v.maxLength(256))

export type JournalAuthorizedUserIds = v.InferOutput<typeof journalAuthorizedUserIdsSchema>
