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
    | "stats"
    | "streaming"
    | "system-prompt"
    | "trust"
    | "welcome"
    | "workspace"
    | "written-files"
}
