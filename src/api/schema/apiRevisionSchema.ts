import * as v from "valibot"

export const apiRevisionSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export type ApiRevision = v.InferOutput<typeof apiRevisionSchema>
