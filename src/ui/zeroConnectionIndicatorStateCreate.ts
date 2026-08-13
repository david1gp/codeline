import { badgeVariant } from "@adaptive-ds/solid-ui/static/badge/badgeCva"
import { useConnectionState } from "@rocicorp/zero/solid"
import { zeroConnectionStatusResolve } from "./zeroConnectionStatusResolve.js"

export function zeroConnectionIndicatorStateCreate() {
  const connectionState = useConnectionState()
  const status = () => zeroConnectionStatusResolve(connectionState())

  return {
    status,
    label: () => {
      if (status() === "online") return "Zero online"
      if (status() === "connecting") return "Zero connecting"
      if (status() === "offline") return "Zero offline"
      return "Zero error"
    },
    variant: () => (status() === "online" ? badgeVariant.filledGreen : badgeVariant.subtle),
  }
}
