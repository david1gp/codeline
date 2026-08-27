import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { sessionDisplayModeRead } from "./sessionDisplayModeRead.js"
import type { SessionDisplayMode } from "./sessionDisplayModeSchema.js"
import { sessionDisplayModeWrite } from "./sessionDisplayModeWrite.js"

export function sessionDisplayModeStateCreate() {
  const mode = createSignalObject<SessionDisplayMode>(sessionDisplayModeRead())

  return {
    mode: mode.get,
    modeSelect: (value: SessionDisplayMode) => {
      mode.set(value)
      sessionDisplayModeWrite(value)
    },
  }
}
