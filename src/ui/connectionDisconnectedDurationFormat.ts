export function connectionDisconnectedDurationFormat(startedAt: number | undefined, now: number): string | undefined {
  if (startedAt === undefined) return undefined
  const elapsedMs = Math.max(0, now - startedAt)
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
