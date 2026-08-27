import * as v from "valibot"

const webfetchToolContentTypeSchema = v.pipe(v.string(), v.maxLength(512))
const webfetchToolOutputTextSchema = v.pipe(v.string(), v.maxLength(1_048_576))
const webfetchToolOutputUrlSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(8_192))

export const webfetchToolOutputSchema = v.strictObject({
  contentType: webfetchToolContentTypeSchema,
  format: v.picklist(["text", "markdown", "html"]),
  output: webfetchToolOutputTextSchema,
  truncated: v.boolean(),
  url: webfetchToolOutputUrlSchema,
})

export type WebfetchToolOutput = v.InferOutput<typeof webfetchToolOutputSchema>
