export const demoNotesFixture = [
  {
    content:
      "Streaming replay checklist\n\n- Confirm `sequence` gaps are backfilled\n- Replay from the last finalized message\n- Cancel mid-stream and reconnect",
    id: "demo-note-replay",
    projectPath: "/workspace/codeline",
    sortOrder: 0,
    updatedAt: 1_760_000_000_000,
  },
  {
    content:
      "HTTP mutation review\n\nTyped mutations must stay deterministic on the client and the server so reconciled state never diverges.",
    id: "demo-note-mutators",
    projectPath: "/workspace/codeline",
    sortOrder: 1,
    updatedAt: 1_759_900_000_000,
  },
  {
    content: "Catalog ideas\n\nRender every reusable component from fixtures, never from a live backend.",
    id: "demo-note-catalog",
    projectPath: null,
    sortOrder: 0,
    updatedAt: 1_759_800_000_000,
  },
] as const
