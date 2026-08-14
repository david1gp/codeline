import * as v from "valibot"
import { attemptStatusSchema } from "./attemptStatusSchema.js"
import { runBudgetSchema } from "./runBudgetSchema.js"
import { runStatusSchema } from "./runStatusSchema.js"

const nonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export const runChildAdmissionInputSchema = v.strictObject({
  attemptStatus: attemptStatusSchema,
  budget: runBudgetSchema,
  cancelled: v.boolean(),
  deadlineAt: nonNegativeIntegerSchema,
  depth: nonNegativeIntegerSchema,
  descendantCount: nonNegativeIntegerSchema,
  now: nonNegativeIntegerSchema,
  parentStatus: runStatusSchema,
})

export type RunChildAdmissionInput = v.InferInput<typeof runChildAdmissionInputSchema>
