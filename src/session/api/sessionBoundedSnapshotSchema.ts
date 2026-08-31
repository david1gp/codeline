import * as v from "valibot"
import { sessionCompactRunInputStateSchema } from "./sessionCompactRunInputStateSchema.js"
import { sessionLatestAnswerSchema } from "./sessionLatestAnswerSchema.js"
import { sessionOlderPageCursorSchema } from "./sessionOlderPageCursorSchema.js"
import { sessionSemanticStepSchema } from "./sessionSemanticStepSchema.js"
import { sessionShellSchema } from "./sessionShellSchema.js"
import { sessionSnapshotWatermarkSchema } from "./sessionSnapshotWatermarkSchema.js"

export const sessionBoundedSnapshotSchema = v.strictObject({
  latestAnswer: sessionLatestAnswerSchema,
  olderCursor: v.nullable(sessionOlderPageCursorSchema),
  semanticSteps: v.pipe(v.array(sessionSemanticStepSchema), v.maxLength(25)),
  session: sessionShellSchema,
  state: sessionCompactRunInputStateSchema,
  throughSeq: sessionSnapshotWatermarkSchema,
})

export type SessionBoundedSnapshot = v.InferOutput<typeof sessionBoundedSnapshotSchema>
