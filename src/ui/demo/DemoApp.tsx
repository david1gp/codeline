import { DemoShell } from "./DemoShell.js"
import { demoScenarioFixtures } from "./demoScenarioFixtures.js"
import { demoAppStateCreate } from "./demoAppStateCreate.js"

export function DemoApp() {
  const state = demoAppStateCreate()

  return <DemoShell fixture={demoScenarioFixtures[state.scenario().slug]} scenario={state.scenario()} />
}
