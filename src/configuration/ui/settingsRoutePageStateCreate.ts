import { useSearchParams } from "@solidjs/router"
import { useContext } from "solid-js"
import * as v from "valibot"
import { appShellContext } from "../../ui/appShellContext.js"
import { pwaStatusContext } from "../../ui/pwa/pwaStatusContext.js"
import { resizableSidebarStateCreate } from "../../ui/resizableSidebarStateCreate.js"
import { settingsSectionSchema } from "./settingsSectionSchema.js"

export function settingsRoutePageStateCreate() {
  const appShell = useContext(appShellContext)
  const [searchParams] = useSearchParams()
  const sidebar = resizableSidebarStateCreate({
    defaultWidth: 240,
    maximumWidth: 360,
    minimumWidth: 184,
    storageKey: "codeline-settings-sidebar-width",
  })
  const activeSection = () => {
    const parsed = v.safeParse(settingsSectionSchema, searchParams.section)
    return parsed.success ? parsed.output : "general"
  }

  return {
    activeSection,
    connection: appShell?.connection,
    projectRegistry: appShell?.projectRegistry,
    pwa: useContext(pwaStatusContext),
    sidebar,
    theme: appShell?.theme,
  }
}
