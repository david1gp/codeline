import { signalObjectCreate } from "../../ui/signalObjectCreate.js"
import type { AuthShellView } from "./authShellView.js"

export function accountPopoverStateCreate(auth: () => AuthShellView) {
  const open = signalObjectCreate(false)

  return {
    isOpen: open.get,
    logout: () => {
      open.set(false)
      auth().logout()
    },
    openChange: open.set,
  }
}
