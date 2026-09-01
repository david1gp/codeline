import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runStatusSchema } from "../../run/schema/runStatusSchema.js"
import { sessionChildReferenceSchema } from "./sessionChildReferenceSchema.js"

const semanticStepSummarySchema = v.pipe(v.string(), v.maxLength(16_384))
const semanticStepSequenceSchema = v.pipe(v.number(), v.integer(), v.minValue(1))
const semanticStepBaseEntries = {
  id: apiPublicIdSchema,
  sequence: semanticStepSequenceSchema,
  summary: semanticStepSummarySchema,
}

export const sessionSemanticStepSchema = v.variant("kind", [
  v.strictObject({
    ...semanticStepBaseEntries,
    kind: v.literal("message"),
    role: v.picklist(["assistant", "user"]),
  }),
  v.strictObject({
    ...semanticStepBaseEntries,
    detailId: apiPublicIdSchema,
    childReference: v.optional(v.nullable(sessionChildReferenceSchema)),
    kind: v.literal("tool"),
    runId: apiPublicIdSchema,
  }),
  v.strictObject({
    ...semanticStepBaseEntries,
    detailId: apiPublicIdSchema,
    kind: v.literal("run"),
    status: v.optional(runStatusSchema),
    terminalKind: v.optional(v.picklist(["cancelled", "completed", "failed", "interrupted"])),
  }),
  v.strictObject({
    ...semanticStepBaseEntries,
    kind: v.literal("input"),
  }),
])

export type SessionSemanticStep = v.InferOutput<typeof sessionSemanticStepSchema>
