export type PwaBrowserStatus = "offline" | "online" | "update-ready"

export function pwaBrowserStatusResolve(input: { online: boolean; updateReady: boolean }): PwaBrowserStatus {
  if (!input.online) return "offline"
  if (input.updateReady) return "update-ready"
  return "online"
}
