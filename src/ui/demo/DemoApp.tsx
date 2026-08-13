import { DemoShell } from "./DemoShell.js"
import type { DemoScenario } from "./demoScenario.js"
import { demoScenarioFixtures } from "./demoScenarioFixtures.js"

export function DemoApp(props: { scenario: DemoScenario }) {
  return <DemoShell fixture={demoScenarioFixtures[props.scenario.slug]} scenario={props.scenario} />
}
