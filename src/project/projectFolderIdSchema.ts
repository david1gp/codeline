import * as v from "valibot"

export const projectFolderIdSchema = v.pipe(
  v.string(),
  v.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
)

export type ProjectFolderId = v.InferOutput<typeof projectFolderIdSchema>
