import type { CommandIntent } from "./commandIntent.js"

export type CommandMenuItem =
  | {
      description: string
      id: string
      intent: CommandIntent
      kind: "action"
      label: string
      keywords: readonly string[]
    }
  | {
      description: string
      href: string
      id: string
      kind: "destination"
      label: string
      keywords: readonly string[]
    }
  | {
      description: string
      id: string
      kind: "project"
      label: string
      projectId: string
      keywords: readonly string[]
    }
  | {
      description: string
      href: string
      id: string
      kind: "session"
      label: string
      keywords: readonly string[]
    }
