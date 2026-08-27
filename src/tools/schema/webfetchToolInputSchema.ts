import * as v from "valibot"

const webfetchToolUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(8_192),
  v.check((value) => !value.includes("\0")),
)

const webfetchToolFormatSchema = v.picklist(["text", "markdown", "html"])

const webfetchToolTimeoutSchema = v.pipe(v.number(), v.finite(), v.minValue(0.001), v.maxValue(120))

export const webfetchToolInputSchema = v.strictObject({
  format: v.optional(webfetchToolFormatSchema, "markdown"),
  timeout: v.optional(webfetchToolTimeoutSchema),
  url: webfetchToolUrlSchema,
})

export type WebfetchToolInput = v.InferOutput<typeof webfetchToolInputSchema>
