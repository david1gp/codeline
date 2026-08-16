import type { SessionStreamGroup } from "../sessionStreamGroupsDerive.js"

export const demoSessionStreamGroupsFixture: ReadonlyArray<SessionStreamGroup> = [
  {
    entries: [
      { id: "demo-thinking", kind: "thinking", label: "Thinking", status: "started" },
      { detail: "src/ui", id: "demo-tool-start", kind: "tool", label: "read_directory", status: "start" },
      { detail: "12 entries", id: "demo-tool-result", kind: "tool", label: "Tool result", status: "success" },
      { detail: "src/ui/SelectedSession.tsx", id: "demo-written", kind: "written-file", label: "Wrote file" },
      {
        detail: "The workspace screen renders from an injected view contract.",
        id: "demo-output",
        kind: "output",
        label: "Output",
      },
      { id: "demo-terminal", kind: "terminal", label: "Terminal", status: "completed" },
    ],
    id: "demo-attempt-1",
    label: "Attempt 1",
    status: "succeeded",
    streamId: "demo-attempt-1",
  },
]
