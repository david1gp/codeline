import { mdiAlertCircleOutline } from "@adaptive-ds/mdi/mdiAlertCircleOutline.js"
import { mdiApi } from "@adaptive-ds/mdi/mdiApi.js"
import { mdiApplicationOutline } from "@adaptive-ds/mdi/mdiApplicationOutline.js"
import { mdiCheckCircleOutline } from "@adaptive-ds/mdi/mdiCheckCircleOutline.js"
import { mdiCloudOffOutline } from "@adaptive-ds/mdi/mdiCloudOffOutline.js"
import { mdiDatabaseSyncOutline } from "@adaptive-ds/mdi/mdiDatabaseSyncOutline.js"
import { mdiDotsHorizontalCircleOutline } from "@adaptive-ds/mdi/mdiDotsHorizontalCircleOutline.js"
import { mdiLanDisconnect } from "@adaptive-ds/mdi/mdiLanDisconnect.js"
import { mdiServerOff } from "@adaptive-ds/mdi/mdiServerOff.js"
import { mdiSync } from "@adaptive-ds/mdi/mdiSync.js"
import { mdiUpdate } from "@adaptive-ds/mdi/mdiUpdate.js"
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
