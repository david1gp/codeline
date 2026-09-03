import type { SessionReadOnlyReason } from "../session/client/sessionReadOnlyReasonResolve.js"

/**
 * The workspace normally shows setup guidance until an execution target is
 * ready. A read-only cached session needs no execution target, so it renders
 * even while servers are unreachable, signed out, or offline.
 */
export function workspaceSessionPaneVisibleResolve(input: {
  configurationStatus: string
  hasSelectedSession?: boolean
  readOnlyReason: SessionReadOnlyReason | null
}): boolean {
  return input.hasSelectedSession === true || input.configurationStatus === "ready" || input.readOnlyReason !== null
}
