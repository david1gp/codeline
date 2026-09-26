import * as v from "valibot"

export const projectFolderDisclosureSchema = v.record(v.string(), v.boolean())

export type ProjectFolderDisclosure = v.InferOutput<typeof projectFolderDisclosureSchema>
