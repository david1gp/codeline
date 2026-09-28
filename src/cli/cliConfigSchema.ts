import * as v from "valibot"

export const cliConfigSchema = v.strictObject({
  backend: v.optional(v.union([v.literal("local"), v.pipe(v.string(), v.url())])),
  session: v.optional(v.pipe(v.string(), v.minLength(1))),
  project: v.optional(v.pipe(v.string(), v.minLength(1))),
  theme: v.optional(v.pipe(v.string(), v.minLength(1))),
})

export type CliConfig = v.InferOutput<typeof cliConfigSchema>
