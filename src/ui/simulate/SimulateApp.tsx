import { SimulateShell } from "./SimulateShell.js"
import { simulateAppStateCreate } from "./simulateAppStateCreate.js"

export function SimulateApp() {
  const state = simulateAppStateCreate()

  return <SimulateShell state={state} />
}
