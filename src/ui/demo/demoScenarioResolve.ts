import { pageRouteDemo } from "../demo_url/pageRouteDemo.js"
import { demoScenarioRegistry } from "./demoScenarioRegistry.js"

export function demoScenarioResolve(pathname: string) {
  const demoPrefix = `${pageRouteDemo.demo}/`
  const slug =
    pathname === pageRouteDemo.demo || pathname === demoPrefix ? "welcome" : pathname.slice(demoPrefix.length)
  return demoScenarioRegistry.find((scenario) => scenario.slug === slug) ?? demoScenarioRegistry[0]
}
