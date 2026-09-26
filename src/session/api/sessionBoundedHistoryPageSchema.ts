import * as v from "valibot"
import { sessionOlderPageCursorSchema } from "./sessionOlderPageCursorSchema.js"
import { sessionSemanticStepSchema } from "./sessionSemanticStepSchema.js"
import { sessionSnapshotWatermarkSchema } from "./sessionSnapshotWatermarkSchema.js"

export const sessionBoundedHistoryPageSchema = v.pipe(
  v.strictObject({
    hasMore: v.boolean(),
    nextCursor: v.nullable(sessionOlderPageCursorSchema),
    // Older pages contain semantic history only; live input state stays absent here.
    semanticSteps: v.pipe(v.array(sessionSemanticStepSchema), v.maxLength(25)),
    throughPosition: sessionSnapshotWatermarkSchema,
  }),
  v.check((page) => page.hasMore === (page.nextCursor !== null), "History pagination state is inconsistent."),
)

export type SessionBoundedHistoryPage = v.InferOutput<typeof sessionBoundedHistoryPageSchema>
