import {
  mdiAlertCircleOutline,
  mdiApi,
  mdiApplicationOutline,
  mdiCheckCircleOutline,
  mdiCloudOffOutline,
  mdiDatabaseSyncOutline,
  mdiDotsHorizontalCircleOutline,
  mdiLanDisconnect,
  mdiServerOff,
  mdiSync,
  mdiUpdate,
} from "@mdi/js"
import { connectionStatusKind, type ConnectionStatusKind } from "./connectionStatusKind.js"
import { connectionStatusSource, type ConnectionStatusSource } from "./connectionStatusSource.js"

export function connectionStatusLineIconResolve(input: {
  kind: ConnectionStatusKind
  source: ConnectionStatusSource
}): string {
  if (input.source === connectionStatusSource.app) {
    if (input.kind === connectionStatusKind.updateReady) return mdiUpdate
    if (input.kind === connectionStatusKind.offline) return mdiCloudOffOutline
    return mdiApplicationOutline
  }
  if (input.source === connectionStatusSource.api) {
    if (input.kind === connectionStatusKind.checking) return mdiDotsHorizontalCircleOutline
    if (input.kind === connectionStatusKind.error || input.kind === connectionStatusKind.offline) return mdiServerOff
    return mdiApi
  }
  if (input.kind === connectionStatusKind.connecting) return mdiSync
  if (input.kind === connectionStatusKind.error) return mdiAlertCircleOutline
  if (input.kind === connectionStatusKind.offline) return mdiLanDisconnect
  return mdiDatabaseSyncOutline
}

export function connectionStatusIconResolve(input: {
  kind: ConnectionStatusKind
  source: ConnectionStatusSource
}): string {
  if (input.kind === connectionStatusKind.ok) return mdiCheckCircleOutline
  return connectionStatusLineIconResolve(input)
}
