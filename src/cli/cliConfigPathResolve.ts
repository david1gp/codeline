import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"

export function cliConfigPathResolve(environment: NodeJS.ProcessEnv = process.env): string {
  const xdgConfigHome = environment.XDG_CONFIG_HOME
  const home = environment.HOME && isAbsolute(environment.HOME) ? environment.HOME : homedir()
  const configHome = xdgConfigHome && isAbsolute(xdgConfigHome) ? xdgConfigHome : join(home, ".config")
  return join(configHome, "codeline", "config.json")
}
