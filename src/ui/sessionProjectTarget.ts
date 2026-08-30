/** Explicit project identity used when a project row starts a session. */
export type SessionProjectTarget = { kind: "registered"; projectId: string } | { kind: "path"; projectPath: string }
