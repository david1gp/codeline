import type { DemoSurfaceFixture } from "./demoSurfaceFixture.js"
import type { DemoWorkspaceFixture } from "./demoWorkspaceFixture.js"

export interface DemoScenarioFixture {
  activeFile: string | null
  activeSession: string | null
  eyebrow: string
  files: readonly {
    depth: number
    kind: "directory" | "file"
    label: string
    status?: "added" | "modified"
  }[]
  heading: string
  history?: {
    hiddenCount: number
    label: string
  }
  messages: readonly {
    actions?: readonly ("Copy" | "Edit" | "Fork" | "Retry")[]
    author: "assistant" | "user"
    body: string
    detail?: string
    kind?: "attachment" | "code" | "error" | "markdown" | "thinking" | "tool"
    label?: string
    meta?: string
    result?: string
    resultTone?: "error" | "success"
    streaming?: boolean
  }[]
  minimap?: readonly {
    active?: boolean
    label: string
  }[]
  composer: {
    action: "Abort" | "Send"
    placeholder: string
    queued?: readonly {
      kind: "follow-up" | "steer"
      text: string
    }[]
    retry?: string
    status?: string
  }
  sessions: readonly {
    active?: boolean
    branch?: boolean
    label: string
    meta: string
    running?: boolean
  }[]
  surface?: DemoSurfaceFixture
  workspace?: DemoWorkspaceFixture
}
