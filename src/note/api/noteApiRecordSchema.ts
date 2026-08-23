import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"

const noteTimestampSchema = v.number()
const noteSortOrderSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export const noteApiRecordSchema = v.strictObject({
  content: v.string(),
  createdAt: noteTimestampSchema,
  id: apiPublicIdSchema,
  projectPath: v.nullable(v.string()),
  revision: apiRevisionSchema,
  sortOrder: v.nullable(noteSortOrderSchema),
  updatedAt: noteTimestampSchema,
  userId: apiPublicIdSchema,
})

export type NoteApiRecord = v.InferOutput<typeof noteApiRecordSchema>
