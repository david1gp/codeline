import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"

export function cliThemePathResolve(environment: NodeJS.ProcessEnv = process.env): string {
  const xdgConfigHome = environment.XDG_CONFIG_HOME
  const configHome =
    xdgConfigHome && isAbsolute(xdgConfigHome) ? xdgConfigHome : join(environment.HOME || homedir(), ".config")
  return join(configHome, "codeline", "themes")
}
