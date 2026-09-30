import type { CommandIntent } from "./commandIntent.js"

export function commandMenuActionDispatch(intent: CommandIntent, dispatch: (intent: CommandIntent) => void) {
  dispatch(intent)
}
