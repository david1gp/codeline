import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useConnectionState } from "@rocicorp/zero/solid"
import { createEffect } from "solid-js"
import { zeroConnectionStatusResolve } from "./zeroConnectionStatusResolve.js"

export function zeroConnectionIndicatorStateCreate() {
  const connectionState = useConnectionState()
  const status = () => zeroConnectionStatusResolve(connectionState())
  const disconnectedSince = createSignalObject<number | undefined>(undefined)

  createEffect(() => {
    const current = status()
    if (current === "offline" || current === "error") {
      if (disconnectedSince.get() === undefined) disconnectedSince.set(Date.now())
      return
    }
    disconnectedSince.set(undefined)
  })

  return {
    status,
    disconnectedSince: () => disconnectedSince.get(),
    label: () => {
      if (status() === "online") return "Zero online"
      if (status() === "connecting") return "Zero connecting"
      if (status() === "offline") return "Zero offline"
      return "Zero error"
    },
  }
}
