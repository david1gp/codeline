import type { SimulateScenario } from "./simulateScenario.js"
import { simulateScenarioRegistry } from "./simulateScenarioRegistry.js"

export function simulateScenarioResolve(pathname: string): SimulateScenario {
  const slug =
    pathname === "/simulate" || pathname === "/simulate/" ? simulateScenarioRegistry[0]?.slug : pathname.slice(10)
  return simulateScenarioRegistry.find((scenario) => scenario.slug === slug) ?? simulateScenarioRegistry[0]
}
