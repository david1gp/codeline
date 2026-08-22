import * as v from "valibot"

export const apiPublicIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200), v.regex(/^[^\r\n]+$/))

export type ApiPublicId = v.InferOutput<typeof apiPublicIdSchema>
