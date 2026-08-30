import { mdiFolderOpenOutline } from "@adaptive-ds/mdi/mdiFolderOpenOutline.js"
import { mdiFolderOutline } from "@adaptive-ds/mdi/mdiFolderOutline.js"

export const projectFolderIconSelect = (open: boolean): string => (open ? mdiFolderOpenOutline : mdiFolderOutline)
