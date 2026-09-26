import * as v from "valibot"

const path = v.pipe(v.string(), v.regex(/^e2e\/[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_.-]*)*\.spec\.ts$/))

export const e2eSuiteSchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^e2e\/[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:\.spec\.ts)?$/)),
  steps: v.pipe(v.array(path), v.minLength(1)),
})

export type E2eSuite = v.InferOutput<typeof e2eSuiteSchema>
