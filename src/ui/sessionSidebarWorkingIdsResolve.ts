export function sessionSidebarWorkingIdsResolve(runs: readonly { sessionId: string }[]): ReadonlySet<string> {
  return new Set(runs.map((run) => run.sessionId))
}
