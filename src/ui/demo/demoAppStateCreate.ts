import { useLocation } from "@solidjs/router"
import { demoScenarioResolve } from "./demoScenarioResolve.js"

export function demoAppStateCreate() {
  const location = useLocation()
  const scenario = () => demoScenarioResolve(location.pathname)

  return { scenario }
}
