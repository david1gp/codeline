import * as v from "valibot"

export const commandDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))

export type CommandDigest = v.InferOutput<typeof commandDigestSchema>
