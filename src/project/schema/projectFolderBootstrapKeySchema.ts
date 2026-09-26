import * as v from "valibot"

export const projectFolderBootstrapKeySchema = v.picklist(["adaptive", "leo", "personal"])

export type ProjectFolderBootstrapKey = v.InferOutput<typeof projectFolderBootstrapKeySchema>
