import * as v from "valibot"

export const testingEchoRequestSchema = v.object({
  message: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
})

export type TestingEchoRequest = v.InferOutput<typeof testingEchoRequestSchema>
