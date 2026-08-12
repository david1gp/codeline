import * as v from "valibot"

export const testingEchoResponseSchema = v.object({
  message: v.string(),
})

export type TestingEchoResponse = v.InferOutput<typeof testingEchoResponseSchema>
