export const demoWorkspaceSessionsFixture = [
  {
    id: "demo-session-workspace",
    parentSessionId: null,
    title: "Workspace shell review",
    updatedAt: Date.parse("2026-08-14T09:00:00.000Z"),
  },
  {
    id: "demo-session-streaming",
    parentSessionId: "demo-session-workspace",
    title: "Streaming transcript audit",
    updatedAt: Date.parse("2026-08-14T08:30:00.000Z"),
  },
  {
    id: "demo-session-branch",
    parentSessionId: "demo-session-streaming",
    title: "Branch: retry handling",
    updatedAt: Date.parse("2026-08-14T08:10:00.000Z"),
  },
  {
    id: "demo-session-catalog",
    parentSessionId: null,
    title: "Catalog specimen coverage",
    updatedAt: Date.parse("2026-08-13T17:45:00.000Z"),
  },
] as const
