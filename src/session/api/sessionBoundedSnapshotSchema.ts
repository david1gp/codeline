import * as v from "valibot"
import { sessionCompactRunInputStateSchema } from "./sessionCompactRunInputStateSchema.js"
import { sessionLatestAnswerSchema } from "./sessionLatestAnswerSchema.js"
import { sessionOlderPageCursorSchema } from "./sessionOlderPageCursorSchema.js"
import { sessionSemanticStepSchema } from "./sessionSemanticStepSchema.js"
import { sessionBoundedShellSchema } from "./sessionBoundedShellSchema.js"
import { sessionSnapshotWatermarkSchema } from "./sessionSnapshotWatermarkSchema.js"

export const sessionBoundedSnapshotSchema = v.pipe(
  v.strictObject({
    hasMore: v.boolean(),
    latestAnswer: sessionLatestAnswerSchema,
    olderCursor: v.nullable(sessionOlderPageCursorSchema),
    semanticSteps: v.pipe(v.array(sessionSemanticStepSchema), v.maxLength(25)),
    session: sessionBoundedShellSchema,
    state: sessionCompactRunInputStateSchema,
    throughSeq: sessionSnapshotWatermarkSchema,
  }),
  v.check(
    (snapshot) => snapshot.hasMore === (snapshot.olderCursor !== null),
    "Snapshot pagination state is inconsistent.",
  ),
)

export type SessionBoundedSnapshot = v.InferOutput<typeof sessionBoundedSnapshotSchema>
