import * as v from "valibot"

const readToolLineSchema = v.strictObject({
  number: v.pipe(v.number(), v.integer(), v.minValue(1)),
  text: v.string(),
})

export const readToolOutputSchema = v.strictObject({
  lines: v.array(readToolLineSchema),
  offset: v.pipe(v.number(), v.integer(), v.minValue(1)),
  path: v.pipe(v.string(), v.minLength(1)),
  totalLines: v.pipe(v.number(), v.integer(), v.minValue(0)),
  version: v.pipe(v.string(), v.minLength(1), v.maxLength(512)),
})

export type ReadToolOutput = v.InferOutput<typeof readToolOutputSchema>
