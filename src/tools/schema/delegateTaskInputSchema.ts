import * as v from "valibot"

const delegateTaskInputLimit = 100_000

export const delegateTaskInputSchema = v.strictObject({
  agentId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  task: v.pipe(v.string(), v.minLength(1), v.maxLength(delegateTaskInputLimit)),
})

export type DelegateTaskInput = v.InferOutput<typeof delegateTaskInputSchema>
