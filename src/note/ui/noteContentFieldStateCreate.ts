import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"
import type { NoteViewMode } from "./noteViewModeSchema.js"

type NoteContentFieldStateOptions = {
  content: () => string
  viewMode: () => NoteViewMode
}

export function noteContentFieldStateCreate(options: NoteContentFieldStateOptions) {
  return {
    isEditorVisible: () => options.viewMode() !== "preview",
    isPreviewVisible: () => options.viewMode() !== "edit",
    isSplit: () => options.viewMode() === "split",
    previewHtml: () => markdownHtmlRender(options.content()),
    isPreviewEmpty: () => options.content().trim() === "",
  }
}
