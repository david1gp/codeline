import { simulationScenarioSessionMetadata } from "./simulationScenarioSessionMetadata.js"

const simulationScenarios = Object.values(simulationScenarioSessionMetadata)
const defaultSimulationScenario = simulationScenarioSessionMetadata.streaming

export function simulationScenarioSessionResolve(pathname: string) {
  const normalizedPathname = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname
  return simulationScenarios.find((scenario) => scenario.href === normalizedPathname) ?? defaultSimulationScenario
}
