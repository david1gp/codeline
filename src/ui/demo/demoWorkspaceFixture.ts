export interface DemoWorkspaceFixture {
  activeTabId: string
  initialMode: "diff" | "preview" | "source"
  notice: string
  tree: readonly {
    depth: number
    id: string
    kind: "directory" | "file"
    label: string
    parentId?: string
    status?: "added" | "conflict" | "modified" | "untracked" | "uploaded"
    tabId?: string
  }[]
  tabs: readonly {
    diff?: {
      left: readonly { kind?: "removed" | "same"; number: number; text: string }[]
      right: readonly { kind?: "added" | "same"; number: number; text: string }[]
    }
    frontmatter?: readonly { key: string; value: string }[]
    id: string
    kind: "markdown" | "mermaid" | "source"
    label: string
    language: string
    markdown?: readonly { heading?: string; text: string }[]
    mermaid?: {
      edges: readonly { from: string; to: string }[]
      nodes: readonly { id: string; label: string; tone: "accent" | "neutral" | "success" }[]
    }
    path: string
    source: readonly string[]
    status?: "added" | "conflict" | "modified" | "untracked" | "uploaded"
  }[]
  uploadConflict?: string
}
