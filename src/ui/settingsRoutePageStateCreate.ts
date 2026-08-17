import { useContext } from "solid-js"
import { appShellContext } from "./appShellContext.js"
import { pwaStatusContext } from "./pwa/pwaStatusContext.js"

export function settingsRoutePageStateCreate() {
  return {
    connection: useContext(appShellContext)?.connection,
    pwa: useContext(pwaStatusContext),
    theme: useContext(appShellContext)?.theme,
  }
}
