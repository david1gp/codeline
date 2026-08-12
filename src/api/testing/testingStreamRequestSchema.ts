import * as v from "valibot"

const testingStreamScenarioSchema = v.optional(
  v.picklist(["normal", "error", "unexpected-end", "idle-timeout"]),
  "normal",
)

const testingStreamMillisecondsSchema = v.optional(
  v.pipe(
    v.string(),
    v.regex(/^\d+$/, "Must be a positive integer."),
    v.transform(Number),
    v.integer("Must be a positive integer."),
    v.minValue(1, "Must be at least 1 millisecond."),
    v.maxValue(60000, "Must be at most 60000 milliseconds."),
  ),
)

export const testingStreamRequestSchema = v.object({
  delayMs: testingStreamMillisecondsSchema,
  idleTimeoutMs: testingStreamMillisecondsSchema,
  scenario: testingStreamScenarioSchema,
})

export type TestingStreamRequest = v.InferOutput<typeof testingStreamRequestSchema>
