export type DemoSurfaceFixture =
  | {
      kind: "models"
      models: readonly {
        context: string
        enabled: boolean
        label: string
        provider: string
        reasoning: string
      }[]
      subtitle: string
      title: string
    }
  | {
      kind: "skills"
      skills: readonly {
        description: string
        label: string
        scope: "project" | "user"
        status: "available" | "disabled"
      }[]
      subtitle: string
      title: string
    }
  | {
      checks: readonly string[]
      kind: "trust"
      path: string
      subtitle: string
      title: string
    }
  | {
      kind: "stats"
      metrics: readonly { label: string; value: string }[]
      subtitle: string
      title: string
      usage: readonly { label: string; percent: number; value: string }[]
    }
  | {
      kind: "system-prompt"
      lines: readonly string[]
      sources: readonly { label: string; status: string }[]
      subtitle: string
      title: string
    }
  | {
      kind: "extensions"
      statuses: readonly { label: string; state: "idle" | "ready" | "warning"; value: string }[]
      subtitle: string
      title: string
      widgets: readonly { label: string; lines: readonly string[]; placement: string }[]
    }
  | {
      files: readonly { additions: number; deletions: number; path: string; status: "created" | "modified" }[]
      kind: "written-files"
      subtitle: string
      title: string
      totals: string
    }
