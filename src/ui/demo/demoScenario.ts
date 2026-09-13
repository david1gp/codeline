export interface DemoScenario {
  description: string
  href: string
  label: string
  slug:
    | "conversation"
    | "diff"
    | "extensions"
    | "files"
    | "long-chat"
    | "markdown"
    | "mermaid"
    | "models"
    | "skills"
    | "session-completed"
    | "session-empty"
    | "session-error"
    | "session-generating"
    | "session-loading"
    | "session-waiting"
    | "stats"
    | "streaming"
    | "system-prompt"
    | "welcome"
    | "workspace"
    | "written-files"
}
