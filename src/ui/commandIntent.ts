export type CommandIntent =
  | { kind: "new-session" }
  | { kind: "new-project" }
  | { kind: "new-session-project"; projectId: string }
