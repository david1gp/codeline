import { useContext } from "solid-js"
import { appShellContext } from "./appShellContext.js"
import { pwaStatusContext } from "./pwa/pwaStatusContext.js"

export function settingsRoutePageStateCreate() {
  const appShell = useContext(appShellContext)

  return {
    connection: appShell?.connection,
    projectRegistry: appShell?.projectRegistry,
    pwa: useContext(pwaStatusContext),
    theme: appShell?.theme,
  }
}
