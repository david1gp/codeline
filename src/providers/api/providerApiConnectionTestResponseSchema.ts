import * as v from "valibot"

export const providerApiConnectionTestResponseSchema = v.strictObject({
  discoveredModelCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  model: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  modelAvailable: v.boolean(),
  ok: v.boolean(),
  provider: v.picklist(["cliproxyapi", "codex-lb", "deterministic"]),
})

export type ProviderApiConnectionTestResponse = v.InferOutput<typeof providerApiConnectionTestResponseSchema>
