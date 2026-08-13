import type { ConnectionState } from "@rocicorp/zero"

export type ZeroConnectionStatus = "connecting" | "online" | "offline" | "error"

export function zeroConnectionStatusResolve(state: ConnectionState): ZeroConnectionStatus {
  if (state.name === "connected") return "online"
  if (state.name === "connecting") return "connecting"
  if (state.name === "disconnected" || state.name === "closed") return "offline"
  return "error"
}
