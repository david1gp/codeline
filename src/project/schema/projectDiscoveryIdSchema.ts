import * as v from "valibot"

export const projectDiscoveryIdSchema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/))

export type ProjectDiscoveryId = v.InferOutput<typeof projectDiscoveryIdSchema>
