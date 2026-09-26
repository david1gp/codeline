import * as v from "valibot"

const projectApiDirectoryProjectSchema = v.strictObject({
  label: v.string(),
  path: v.string(),
})

export const projectApiDirectoryConfirmResponseSchema = v.strictObject({
  project: projectApiDirectoryProjectSchema,
})

export type ProjectApiDirectoryConfirmResponse = v.InferOutput<typeof projectApiDirectoryConfirmResponseSchema>
