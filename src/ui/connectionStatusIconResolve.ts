import { applicationIcon } from "./applicationIcon.js"
import { type ConnectionStatusKind, connectionStatusKind } from "./connectionStatusKind.js"
import { type ConnectionStatusSource, connectionStatusSource } from "./connectionStatusSource.js"

export function connectionStatusLineIconResolve(input: {
  kind: ConnectionStatusKind
  source: ConnectionStatusSource
}): string {
  if (input.source === connectionStatusSource.app) {
    if (input.kind === connectionStatusKind.updateReady) return applicationIcon.connectionAppUpdate
    if (input.kind === connectionStatusKind.offline) return applicationIcon.connectionAppOffline
    return applicationIcon.application
  }
  if (input.source === connectionStatusSource.api) {
    if (input.kind === connectionStatusKind.checking) return applicationIcon.connectionApiChecking
    if (input.kind === connectionStatusKind.error || input.kind === connectionStatusKind.offline) {
      return applicationIcon.connectionServerUnavailable
    }
    return applicationIcon.connectionApi
  }
  if (input.kind === connectionStatusKind.connecting) return applicationIcon.connectionSyncing
  if (input.kind === connectionStatusKind.error) return applicationIcon.connectionError
  if (input.kind === connectionStatusKind.offline) return applicationIcon.connectionNetworkOffline
  return applicationIcon.connectionDatabase
}

export function connectionStatusIconResolve(input: {
  kind: ConnectionStatusKind
  source: ConnectionStatusSource
}): string {
  if (input.kind === connectionStatusKind.ok) return applicationIcon.connectionOk
  return connectionStatusLineIconResolve(input)
}
