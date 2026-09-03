import { pageRouteSimulate } from "./pageRouteSimulate.js"

export function urlSimulate() {
  return pageRouteSimulate.simulate
}

export function urlSimulateScenario(scenarioSlug: string) {
  return `${pageRouteSimulate.simulate}/${encodeURIComponent(scenarioSlug)}`
}

export function urlSimulateUnknown(rest: string) {
  if (!rest) return pageRouteSimulate.simulate
  const encoded = rest
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return pageRouteSimulate.simulateUnknown.replace("*unknownSimulation", encoded)
}
