import { DemoCatalogShell } from "./DemoCatalogShell.js"
import { demoAppStateCreate } from "./demoAppStateCreate.js"

export function DemoApp() {
  const state = demoAppStateCreate()

  return <DemoCatalogShell state={state} />
}
