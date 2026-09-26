import * as v from "valibot"
import { e2eSuiteSchema } from "./e2eSuiteSchema.js"

export const e2eCheckpointSchema = v.strictObject({
  version: v.literal(2),
  target: v.picklist(["production", "dev"]),
  origin: v.pipe(v.string(), v.url(), v.startsWith("https://")),
  runId: v.pipe(v.string(), v.regex(/^[0-9a-z]{6,40}$/)),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  suiteManifest: v.array(e2eSuiteSchema),
  completedSuites: v.array(v.pipe(v.string(), v.regex(/^e2e\/[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:\.spec\.ts)?$/))),
  resourceIds: v.strictObject({ fixtureRunIds: v.array(v.pipe(v.string(), v.regex(/^[0-9a-z]{6,40}$/))) }),
})

export type E2eCheckpoint = v.InferOutput<typeof e2eCheckpointSchema>
