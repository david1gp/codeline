import { useContext } from "solid-js"
import { pwaStatusContext } from "./pwa/pwaStatusContext.js"

export function settingsRoutePageStateCreate() {
  return useContext(pwaStatusContext)
}
