import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

export interface DemoSpecimen {
  description: string
  href: string
  label: string
  /** Rendered by DemoSpecimenPanel, which keeps the registry free of JSX. */
  slug:
    | "app-shell"
    | "files-screen"
    | "finalized-message"
    | "note-back-link"
    | "note-screen"
    | "new-note-screen"
    | "note-content-field"
    | "note-view-mode-switcher"
    | "note-workspace-screen"
    | "notes-screen"
    | "project-browser"
    | "project-git-panel"
    | "provider-model-selector"
    | "connection-status-indicator"
    | "selected-session"
    | "session-chat"
    | "session-list"
    | "session-rename-control"
    | "session-target-selector"
    | "theme-switcher"
    | "workspace-screen"

  variants: readonly DemoSessionScreenVariant[]
}
