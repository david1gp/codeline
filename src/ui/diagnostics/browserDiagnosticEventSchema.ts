import * as v from "valibot"

export const browserDiagnosticEventSchema = v.strictObject({
  data: v.optional(v.unknown()),
  level: v.picklist(["debug", "info", "warn", "error"]),
  message: v.string(),
  source: v.optional(v.string()),
  stack: v.optional(v.string()),
  timestamp: v.optional(v.union([v.number(), v.string()])),
  url: v.optional(v.string()),
})

export type BrowserDiagnosticEvent = v.InferOutput<typeof browserDiagnosticEventSchema>
export type BrowserDiagnosticEventInput = v.InferInput<typeof browserDiagnosticEventSchema>
