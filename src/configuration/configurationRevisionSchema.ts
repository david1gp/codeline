import * as v from "valibot"

export const configurationRevisionSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export type ConfigurationRevision = v.InferOutput<typeof configurationRevisionSchema>
