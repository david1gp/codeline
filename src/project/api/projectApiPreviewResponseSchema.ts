import * as v from "valibot"

const projectApiTextPreviewResponseSchema = v.strictObject({
  path: v.string(),
  kind: v.literal("text"),
  mimeType: v.string(),
  content: v.string(),
  size: v.number(),
})

const projectApiBinaryPreviewResponseSchema = v.strictObject({
  path: v.string(),
  kind: v.picklist(["image", "pdf"]),
  mimeType: v.string(),
  size: v.number(),
  url: v.string(),
})

const projectApiUnsupportedPreviewResponseSchema = v.strictObject({
  path: v.string(),
  kind: v.literal("unsupported"),
  mimeType: v.literal("application/octet-stream"),
  size: v.number(),
})

export const projectApiPreviewResponseSchema = v.union([
  projectApiTextPreviewResponseSchema,
  projectApiBinaryPreviewResponseSchema,
  projectApiUnsupportedPreviewResponseSchema,
])

export type ProjectApiPreviewResponse = v.InferOutput<typeof projectApiPreviewResponseSchema>
