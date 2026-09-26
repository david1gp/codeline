import type { projectRegistryStateCreate } from "./projectRegistryStateCreate.js"

type ProjectRegistryStateValue = ReturnType<typeof projectRegistryStateCreate>

export type ProjectRegistryState = Omit<
  ProjectRegistryStateValue,
  "folderCreate" | "folderFind" | "folderRemove" | "folderRename" | "folders" | "projectMove"
> & {
  folderCreate?: ProjectRegistryStateValue["folderCreate"]
  folderFind?: ProjectRegistryStateValue["folderFind"]
  folderRemove?: ProjectRegistryStateValue["folderRemove"]
  folderRename?: ProjectRegistryStateValue["folderRename"]
  folders?: ProjectRegistryStateValue["folders"]
  projectMove?: ProjectRegistryStateValue["projectMove"]
}
