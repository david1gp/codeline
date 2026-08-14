export const connectionStatusKind = {
  ok: "ok",
  checking: "checking",
  connecting: "connecting",
  updateReady: "updateReady",
  offline: "offline",
  error: "error",
} as const

export type ConnectionStatusKind = (typeof connectionStatusKind)[keyof typeof connectionStatusKind]
