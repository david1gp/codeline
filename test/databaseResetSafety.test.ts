import { expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { managedDatabaseConsumerUnitsRead } from "../scripts/managedDatabaseConsumerUnits.js"

const packageJson = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text()) as {
  scripts: Record<string, string>
}
const resetScript = await Bun.file(new URL("../scripts/dbReset.ts", import.meta.url)).text()
const seedScript = await Bun.file(new URL("../scripts/dbSeed.ts", import.meta.url)).text()
const resetLockScript = await Bun.file(new URL("../scripts/managedDatabaseResetLockRun.ts", import.meta.url)).text()
const consumersScript = await Bun.file(new URL("../scripts/managedDatabaseConsumersStop.ts", import.meta.url)).text()
const apiUnit = await Bun.file(new URL("../ops/dev/systemd/codeline-dev-api.service", import.meta.url)).text()
const installScript = await Bun.file(new URL("../ops/dev/systemd/install.sh", import.meta.url)).text()
const installScriptPath = new URL("../ops/dev/systemd/install.sh", import.meta.url).pathname
const openCodeSkillsPath = new URL("../.opencode/skills", import.meta.url).pathname

test("the known managed consumer inventory remains explicit", () => {
  expect(managedDatabaseConsumerUnitsRead()).toEqual(["codeline-dev-api.service"])
  expect(consumersScript).toContain("managedDatabaseConsumerUnitsRead()")
  expect(consumersScript).toContain('"codeline-dev.target"')
  expect(consumersScript).not.toContain("codeline-dev-postgres.service")
})

test("the managed service uses the active adaptive checkout", () => {
  expect(apiUnit).toContain("WorkingDirectory=%h/adaptive/codeline")
  expect(apiUnit).toContain("EnvironmentFile=%h/adaptive/codeline/.env")
  expect(apiUnit).toContain("ExecStartPost=%h/adaptive/codeline/ops/dev/codeline-dev.sh wait api")
  expect(apiUnit).not.toContain("%h/codeline")
  expect(installScript).toContain('stable_checkout="$HOME/adaptive/codeline"')
  expect(installScript).not.toContain('stable_checkout="$HOME/codeline"')
})

test("the repository OpenCode skills link uses the checked-in skills directory", async () => {
  expect(await fs.readlink(openCodeSkillsPath)).toBe("../.agents/skills")
})

type InstallScenario = "active" | "absent" | "failed" | "query-error"

async function installScenarioRun(scenario: InstallScenario, runs: number, createLink: boolean) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-systemd-install-"))
  const binDirectory = path.join(directory, "bin")
  const configDirectory = path.join(directory, "config")
  const unitDirectory = path.join(configDirectory, "systemd/user")
  const systemctlLog = path.join(directory, "systemctl.log")
  const systemctlState = path.join(directory, "state")
  const systemctlPath = path.join(binDirectory, "systemctl")
  const uiUnitPath = path.join(unitDirectory, "codeline-dev-ui.service")

  await fs.mkdir(binDirectory, { recursive: true })
  await fs.mkdir(unitDirectory, { recursive: true })
  await fs.writeFile(
    systemctlPath,
    `#!/usr/bin/env bash
set -u
printf '%s\\n' "$*" >> "${systemctlLog}"
[[ "\${1:-}" == --user ]] || exit 97
command=\${2:-}
case "$command" in
  show)
    if [[ "\${CODELINE_SYSTEMCTL_SCENARIO:-}" == query-error ]]; then exit 42; fi
    if [[ "\${CODELINE_SYSTEMCTL_SCENARIO:-}" == absent ]]; then
      printf 'LoadState=not-found\\nActiveState=inactive\\n'
    elif [[ -f "${systemctlState}" ]]; then
      printf 'LoadState=loaded\\nActiveState='
      IFS= read -r state < "${systemctlState}"
      printf '%s\\n' "$state"
    elif [[ "\${CODELINE_SYSTEMCTL_SCENARIO:-}" == failed ]]; then
      printf 'LoadState=loaded\\nActiveState=failed\\n'
    else
      printf 'LoadState=loaded\\nActiveState=active\\n'
    fi
    ;;
  is-enabled)
    if [[ "\${CODELINE_SYSTEMCTL_SCENARIO:-}" == absent ]]; then
      printf 'not-found\\n'
      exit 1
    fi
    printf 'enabled\\n'
    ;;
  stop)
    printf 'inactive\\n' > "${systemctlState}"
    ;;
  reset-failed)
    printf 'inactive\\n' > "${systemctlState}"
    ;;
  disable|daemon-reload) ;;
  *) exit 98 ;;
esac
`,
  )
  await fs.chmod(systemctlPath, 0o755)
  if (createLink) await fs.symlink("/nonexistent/codeline-dev-ui.service", uiUnitPath)

  const environment = {
    ...process.env,
    CODELINE_SYSTEMCTL_SCENARIO: scenario,
    CODELINE_SYSTEMCTL_STATE: systemctlState,
    CODELINE_SYSTEMCTL_LOG: systemctlLog,
    HOME: directory,
    PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
    XDG_CONFIG_HOME: configDirectory,
  }

  try {
    const results: Array<{ exitCode: number; stderr: string }> = []
    for (let index = 0; index < runs; index += 1) {
      const child = Bun.spawn(["bash", installScriptPath, "remove"], {
        env: environment,
        stderr: "pipe",
        stdout: "pipe",
      })
      const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited])
      results.push({ exitCode, stderr })
    }
    const log = await fs.readFile(systemctlLog, "utf8")
    const linkExists = await fs
      .lstat(uiUnitPath)
      .then(() => true)
      .catch(() => false)
    return { linkExists, log, results }
  } finally {
    await fs.rm(directory, { force: true, recursive: true })
  }
}

test("managed systemd installation retires an active stale UI service before unlinking it", async () => {
  const result = await installScenarioRun("active", 1, true)

  expect(result.results).toEqual([{ exitCode: 0, stderr: "" }])
  expect(result.linkExists).toBe(false)
  expect(result.log).toContain("--user stop codeline-dev-ui.service")
  expect(result.log).toContain("--user is-enabled codeline-dev-ui.service")
  expect(result.log).toContain("--user disable codeline-dev-ui.service")
  expect(result.log.split("\n").filter((line) => line.includes("--user show codeline-dev-ui.service"))).toHaveLength(3)
})

test("managed systemd installation resets a failed stale UI service before unlinking it", async () => {
  const result = await installScenarioRun("failed", 1, true)

  expect(result.results).toEqual([{ exitCode: 0, stderr: "" }])
  expect(result.linkExists).toBe(false)
  expect(result.log).toContain("--user reset-failed codeline-dev-ui.service")
  expect(result.log).not.toContain("--user stop codeline-dev-ui.service")
  expect(result.log).toContain("--user is-enabled codeline-dev-ui.service")
  expect(result.log).toContain("--user disable codeline-dev-ui.service")
  expect(result.log.split("\n").filter((line) => line.includes("--user show codeline-dev-ui.service"))).toHaveLength(3)
})

test("managed systemd installation is idempotent when the stale UI service is absent", async () => {
  const result = await installScenarioRun("absent", 2, false)

  expect(result.results).toEqual([
    { exitCode: 0, stderr: "" },
    { exitCode: 0, stderr: "" },
  ])
  expect(result.linkExists).toBe(false)
  expect(result.log).not.toContain("--user stop codeline-dev-ui.service")
  expect(result.log).not.toContain("--user disable codeline-dev-ui.service")
  expect(result.log.split("\n").filter((line) => line.includes("--user show codeline-dev-ui.service"))).toHaveLength(6)
})

test("managed systemd installation keeps an indeterminate stale UI service link", async () => {
  const result = await installScenarioRun("query-error", 1, true)

  expect(result.results[0]?.exitCode).not.toBe(0)
  expect(result.results[0]?.stderr).toContain("unable to query the state")
  expect(result.linkExists).toBe(true)
  expect(result.log).not.toContain("--user stop codeline-dev-ui.service")
  expect(result.log).not.toContain("--user disable codeline-dev-ui.service")
})

test("direct reset stops consumers before deleting the SQLite database and sidecars", () => {
  expect(resetScript).not.toContain("managedPostgresTargetAssert")
  expect(resetScript).not.toContain("managedPostgresServiceEnsure")
  expect(resetScript).not.toContain("postgres(")
  expect(resetScript.indexOf("managedDatabaseConsumersStop()")).toBeLessThan(resetScript.indexOf("await rm("))
  expect(resetScript).toContain("databasePath")
  expect(resetScript).toMatch(/`\$\{databaseFilePath\}-wal`/)
  expect(resetScript).toMatch(/`\$\{databaseFilePath\}-shm`/)

  expect(packageJson.scripts["db:reset"]).toBe("bun scripts/dbReset.ts")
  expect(packageJson.scripts["db:seed"]).toContain("bun scripts/managedDatabaseResetLockRun.ts --")
  expect(packageJson.scripts["db:seed"]).toContain("bun run db:migrate")
  expect(packageJson.scripts["db:seed"]).toContain('bun scripts/dbSeed.ts "$@"')
  expect(packageJson.scripts["db:reset-seed"]).toContain("bun scripts/managedDatabaseResetLockRun.ts --")
  expect(packageJson.scripts["db:reset-seed"]).toContain("bun run db:migrate")
  expect(packageJson.scripts["db:reset-seed"]).toContain("bun scripts/dbSeed.ts --reset")
  expect(packageJson.scripts["db:migrate"]).toBe("bun scripts/dbMigrate.ts")
})

test("reset workflows use a nonblocking managed-database lock", () => {
  expect(resetLockScript).not.toContain("managedPostgresTargetAssert")
  expect(resetLockScript).toContain('"managed-sqlite"')
  expect(resetLockScript).toContain("path.resolve(databaseFilePath)")
  expect(resetLockScript).toContain('"--nonblock"')
  expect(resetLockScript).toContain('"--conflict-exit-code"')
  expect(resetLockScript).toContain("Another managed database reset/bootstrap command")
  expect(resetLockScript).toContain("CODELINE_MANAGED_DATABASE_RESET_LOCK_HELD")
  expect(resetScript).toContain("managedDatabaseResetLockRun(")
  expect(seedScript).toContain("managedDatabaseResetLockRun(")
})
