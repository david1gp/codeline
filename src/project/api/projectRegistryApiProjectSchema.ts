import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"
import { projectFolderIdSchema } from "../projectFolderIdSchema.js"
import { projectIdSchema } from "../projectIdSchema.js"

export const projectRegistryApiProjectSchema = v.strictObject({
  active: v.optional(v.boolean()),
  available: v.boolean(),
  faviconUrl: v.nullable(v.string()),
  folderId: v.optional(v.nullable(projectFolderIdSchema)),
  id: projectIdSchema,
  label: v.pipe(v.string(), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
  parentFolder: v.optional(
    v.nullable(
      v.strictObject({
        id: projectFolderIdSchema,
        label: v.pipe(v.string(), v.minLength(1), v.maxLength(projectDiscoveryLimits.maximumLabelLength)),
      }),
    ),
    null,
  ),
  unseenEnded: v.optional(v.boolean()),
})

export type ProjectRegistryApiProject = v.InferOutput<typeof projectRegistryApiProjectSchema>
