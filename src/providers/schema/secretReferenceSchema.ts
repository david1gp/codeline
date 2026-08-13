import * as v from "valibot"

export const secretReferenceSchema = v.pipe(v.string(), v.regex(/^\$[A-Z][A-Z0-9_]{0,127}$/))

export type SecretReference = v.InferOutput<typeof secretReferenceSchema>
