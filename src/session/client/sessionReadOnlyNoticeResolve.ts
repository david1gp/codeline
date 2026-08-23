import type { SessionReadOnlyReason } from "./sessionReadOnlyReasonResolve.js"

/** Single sentence explaining why the open session cannot currently be changed. */
export function sessionReadOnlyNoticeResolve(reason: SessionReadOnlyReason): string {
  if (reason === "signed-out")
    return "Signed out. You are browsing this device's saved copy of your last account read-only. Sign in to continue the conversation."
  if (reason === "offline")
    return "Offline. You are browsing a saved copy of this conversation read-only. Reconnect to continue."
  return "Showing a saved copy of this conversation while it revalidates. Sending is paused until it is up to date."
}
