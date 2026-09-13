import { applicationIcon } from "../../ui/applicationIcon.js"

export const projectFolderIconSelect = (open: boolean): string =>
  open ? applicationIcon.folderOpen : applicationIcon.folder
