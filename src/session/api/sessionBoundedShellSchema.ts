import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"

export const sessionBoundedShellSchema = v.strictObject({
  id: apiPublicIdSchema,
  pinned: v.boolean(),
  projectPath: v.pipe(v.string(), v.maxLength(4_096)),
  revision: apiRevisionSchema,
  title: v.pipe(v.string(), v.maxLength(500)),
})

export type SessionBoundedShell = v.InferOutput<typeof sessionBoundedShellSchema>
