import * as v from "valibot"
import { attemptStatusSchema } from "./attemptStatusSchema.js"
import { runBudgetSchema } from "./runBudgetSchema.js"
import { runFailureMetadataSchema } from "./runFailureMetadataSchema.js"

const attemptOrdinalSchema = v.pipe(v.number(), v.integer(), v.minValue(1))

export const runRetryAdmissionInputSchema = v.strictObject({
  attemptOrdinal: attemptOrdinalSchema,
  attemptStatus: attemptStatusSchema,
  budget: runBudgetSchema,
  failure: runFailureMetadataSchema,
})

export type RunRetryAdmissionInput = v.InferInput<typeof runRetryAdmissionInputSchema>
