import * as v from "valibot"

export const apiSequenceSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export type ApiSequence = v.InferOutput<typeof apiSequenceSchema>
