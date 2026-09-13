import { useSearchParams } from "@solidjs/router"
import { useContext } from "solid-js"
import * as v from "valibot"
import { appShellContext } from "./appShellContext.js"
import { configurationEditorStateCreate } from "./configuration/configurationEditorStateCreate.js"
import { pwaStatusContext } from "./pwa/pwaStatusContext.js"
import { settingsSectionSchema } from "./settingsSectionSchema.js"

export function settingsRoutePageStateCreate() {
  const appShell = useContext(appShellContext)
  const [searchParams] = useSearchParams()
  const subagents = configurationEditorStateCreate("subagents", "codeline-config-subagents")
  const skills = configurationEditorStateCreate("skills", "codeline-config-skills")
  const commands = configurationEditorStateCreate("commands", "codeline-config-commands")
  const activeSection = () => {
    const parsed = v.safeParse(settingsSectionSchema, searchParams.section)
    return parsed.success ? parsed.output : "general"
  }
  const configuration = () => {
    const section = activeSection()
    if (section === "subagents") return subagents
    if (section === "skills") return skills
    if (section === "commands") return commands
    return undefined
  }

  return {
    activeSection,
    configuration,
    connection: appShell?.connection,
    projectRegistry: appShell?.projectRegistry,
    pwa: useContext(pwaStatusContext),
    theme: appShell?.theme,
  }
}
