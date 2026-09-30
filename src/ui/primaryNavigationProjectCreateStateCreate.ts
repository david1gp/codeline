import { signalObjectCreate } from "./signalObjectCreate.js"

export function primaryNavigationProjectCreateStateCreate() {
  const open = signalObjectCreate(false)

  return {
    dialogOpen: open.get,
    dialogOpenChange: open.set,
    open: () => open.set(true),
  }
}
