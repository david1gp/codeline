import * as v from "valibot"
import { runBudgetSchema } from "./runBudgetSchema.js"
import { runExecutionSnapshotSchema } from "./runExecutionSnapshotSchema.js"

const runIdentifierSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const runCreateInputSchema = v.strictObject({
  budget: v.optional(runBudgetSchema),
  clientRunId: runIdentifierSchema,
  snapshot: runExecutionSnapshotSchema,
  streamId: runIdentifierSchema,
})

export type RunCreateInput = v.InferInput<typeof runCreateInputSchema>
