import * as v from "valibot"
import { commandNameSchema } from "./commandNameSchema.js"

export const commandInvocationSchema = v.strictObject({
  arguments: v.optional(v.pipe(v.string(), v.maxLength(100_000)), ""),
  name: commandNameSchema,
})

export type CommandInvocation = v.InferOutput<typeof commandInvocationSchema>
