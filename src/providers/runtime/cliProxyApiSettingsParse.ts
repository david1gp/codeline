import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { secretReferenceSchema } from "../schema/secretReferenceSchema.js"

const cliProxyApiSettingsSchema = v.strictObject({
  baseUrl: v.pipe(
    v.string(),
    v.trim(),
    v.url(),
    v.check((value) => {
      if (!URL.canParse(value)) return false
      const url = new URL(value)
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.username.length === 0 &&
        url.password.length === 0 &&
        url.search.length === 0 &&
        url.hash.length === 0
      )
    }),
  ),
  apiKey: v.pipe(
    secretReferenceSchema,
    v.check((value) => value === "$CLIPROXYAPI_API_KEY"),
  ),
  model: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  maxTokens: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1_000_000)),
  temperature: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(2)),
})

export type CliProxyApiSettings = v.InferOutput<typeof cliProxyApiSettingsSchema>

export function cliProxyApiSettingsParse(input: unknown): Result<CliProxyApiSettings> {
  const op = "cliProxyApiSettingsParse"
  const parsed = v.safeParse(cliProxyApiSettingsSchema, input)
  if (!parsed.success) return createResultError(op, "CLIProxyAPI settings are invalid.")
  return createResult(parsed.output)
}
