import * as v from "valibot"

const childIdentifierSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
const childTaskSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100_000))

export const runChildCreateInputSchema = v.strictObject({
  delegationKey: childIdentifierSchema,
  parentAttemptId: childIdentifierSchema,
  parentRunId: childIdentifierSchema,
  task: childTaskSchema,
})

export type RunChildCreateInput = v.InferInput<typeof runChildCreateInputSchema>
