export function sessionBoundedDelegationToolKeyCreate(runId: string, detailId: string): string {
  return `${runId}\u0000${detailId}`
}
