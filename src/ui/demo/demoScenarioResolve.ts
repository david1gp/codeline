import { demoScenarioRegistry } from "./demoScenarioRegistry.js"

export function demoScenarioResolve(pathname: string) {
  const slug = pathname === "/demo" || pathname === "/demo/" ? "welcome" : pathname.slice(6)
  return demoScenarioRegistry.find((scenario) => scenario.slug === slug) ?? demoScenarioRegistry[0]
}
