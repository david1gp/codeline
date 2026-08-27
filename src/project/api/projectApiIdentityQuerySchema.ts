import * as v from "valibot"

export const projectApiIdentityQuerySchema = v.strictObject({
  path: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4096)),
})

export type ProjectApiIdentityQuery = v.InferOutput<typeof projectApiIdentityQuerySchema>
