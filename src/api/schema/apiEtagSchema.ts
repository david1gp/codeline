import * as v from "valibot"

export const apiEtagSchema = v.pipe(v.string(), v.minLength(2), v.maxLength(256), v.regex(/^"[^"\r\n]*"$/))

export type ApiEtag = v.InferOutput<typeof apiEtagSchema>
