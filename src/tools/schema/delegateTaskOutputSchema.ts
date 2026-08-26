import * as v from "valibot"

const delegateTaskOutputLimit = 16_384

export const delegateTaskOutputSchema = v.pipe(v.string(), v.maxLength(delegateTaskOutputLimit))

export type DelegateTaskOutput = v.InferOutput<typeof delegateTaskOutputSchema>
