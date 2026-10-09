import * as v from "valibot"

export const runCancelInputSchema = v.strictObject({
  kind: v.optional(v.literal("requested"), "requested"),
  /**
   * `immediate` aborts even mid-tool (default, preserves existing behavior).
   * `graceful` lets the in-flight tool complete and persist, then stops the
   * run at the next safe boundary before the following model round.
   */
  mode: v.optional(v.picklist(["graceful", "immediate"]), "immediate"),
})

export type RunCancelInput = v.InferInput<typeof runCancelInputSchema>
