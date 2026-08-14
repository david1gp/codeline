import type { ProjectApiDirectoryResponse } from "./api/projectApiDirectoryResponseSchema.js"
import { projectByteSizeFormat } from "./projectByteSizeFormat.js"
import { projectEntryPresentationClassify } from "./projectEntryPresentationClassify.js"
import { projectModifiedAtFormat } from "./projectModifiedAtFormat.js"

type ProjectEntry = ProjectApiDirectoryResponse["entries"][number]

export function projectEntryAccessibleName(entry: ProjectEntry): string {
  const modifiedAt = projectModifiedAtFormat(entry.modifiedAt)

  if (entry.type === "directory") return `Open folder ${entry.name}, modified ${modifiedAt}`
  if (entry.type === "other") return `Unavailable entry ${entry.name}, modified ${modifiedAt}`

  const presentation = projectEntryPresentationClassify(entry)
  return `Open file ${entry.name}, ${presentation.label}, ${projectByteSizeFormat(entry.size)}, modified ${modifiedAt}`
}
