import { connectionStatusKind, type ConnectionStatusKind } from "./connectionStatusKind.js"
import { connectionStatusSource, type ConnectionStatusSource } from "./connectionStatusSource.js"

export type ConnectionStatusLine = {
  disconnectedSince: number | undefined
  icon: string
  kind: ConnectionStatusKind
  label: string
  source: ConnectionStatusSource
}

export type ConnectionStatusSummary = {
  kind: ConnectionStatusKind
  source: ConnectionStatusSource
}

const kindPriority: Record<ConnectionStatusKind, number> = {
  [connectionStatusKind.error]: 0,
  [connectionStatusKind.offline]: 1,
  [connectionStatusKind.connecting]: 2,
  [connectionStatusKind.checking]: 3,
  [connectionStatusKind.updateReady]: 4,
  [connectionStatusKind.ok]: 5,
}

const sourcePriority: Record<ConnectionStatusSource, number> = {
  [connectionStatusSource.events]: 0,
  [connectionStatusSource.api]: 1,
  [connectionStatusSource.app]: 2,
}

export function connectionStatusSummaryResolve(lines: ConnectionStatusLine[]): ConnectionStatusSummary {
  const [first, ...rest] = lines
  let best = first ?? {
    disconnectedSince: undefined,
    icon: "",
    kind: connectionStatusKind.ok,
    label: "All systems ok",
    source: connectionStatusSource.app,
  }
  for (const line of rest) {
    const kindDelta = kindPriority[line.kind] - kindPriority[best.kind]
    if (kindDelta < 0) {
      best = line
      continue
    }
    if (kindDelta > 0) continue
    if (sourcePriority[line.source] < sourcePriority[best.source]) best = line
  }
  return { kind: best.kind, source: best.source }
}
