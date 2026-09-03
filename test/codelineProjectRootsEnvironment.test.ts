import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

const helperPath = path.resolve("ops/dev/codeline-project-roots.sh")
const developmentScript = await Bun.file(path.resolve("ops/dev/codeline-dev.sh")).text()
const serviceUnit = await Bun.file(path.resolve("ops/dev/systemd/codeline-dev-api.service")).text()
const checkedInDefaults = await Bun.file(path.resolve("ops/dev/codeline-defaults.env")).text()

async function projectRootsEnvironmentRun(
  envFile: string,
  defaultsFile: string,
  projectRoots: string | undefined,
  home: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const environment: Record<string, string | undefined> = {
    ...process.env,
    HOME: home,
    OTHER_SECRET: "must-remain-in-the-environment",
  }
  if (projectRoots === undefined) delete environment.CODELINE_PROJECT_ROOTS
  else environment.CODELINE_PROJECT_ROOTS = projectRoots

  const child = Bun.spawn(
    [
      "bash",
      "-c",
      'source "$1"; codeline_project_roots_export "$2" "$3"; printf "ROOT=<%s>\\nSECRET=<%s>\\n" "$CODELINE_PROJECT_ROOTS" "$OTHER_SECRET"',
      "bash",
      helperPath,
      envFile,
      defaultsFile,
    ],
    { env: environment, stderr: "pipe", stdout: "pipe" },
  )
  const [stderr, stdout, exitCode] = await Promise.all([
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
    child.exited,
  ])
  return { exitCode, stderr, stdout }
}

test("managed database root configuration uses shell, env-file, then defaults precedence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codeline-project-roots-environment-"))
  const envFile = path.join(directory, "env")
  const defaultsFile = path.join(directory, "defaults")
  const home = path.join(directory, "home")

  try {
    await writeFile(envFile, 'CODELINE_PROJECT_ROOTS=["from-env"]\n', "utf8")
    await writeFile(defaultsFile, `CODELINE_PROJECT_ROOTS=["\${HOME}/from-defaults"]\n`, "utf8")

    await expect(projectRootsEnvironmentRun(envFile, defaultsFile, '["from-shell"]', home)).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: 'ROOT=<["from-shell"]>\nSECRET=<must-remain-in-the-environment>\n',
    })
    await expect(projectRootsEnvironmentRun(envFile, defaultsFile, "", home)).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "ROOT=<>\nSECRET=<must-remain-in-the-environment>\n",
    })
    await expect(projectRootsEnvironmentRun(envFile, defaultsFile, undefined, home)).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: 'ROOT=<["from-env"]>\nSECRET=<must-remain-in-the-environment>\n',
    })

    await writeFile(envFile, "NODE_ENV=development\n", "utf8")
    await expect(projectRootsEnvironmentRun(envFile, defaultsFile, undefined, home)).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: `ROOT=<["${home}/from-defaults"]>\nSECRET=<must-remain-in-the-environment>\n`,
    })

    await writeFile(envFile, "CODELINE_PROJECT_ROOTS=\n", "utf8")
    await expect(projectRootsEnvironmentRun(envFile, defaultsFile, undefined, home)).resolves.toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "ROOT=<>\nSECRET=<must-remain-in-the-environment>\n",
    })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test("managed database commands wire the resolved roots into child workflows", () => {
  expect(developmentScript).toContain('source "$script_dir/codeline-project-roots.sh"')
  expect(developmentScript).toContain("project_roots_export")
  expect(developmentScript).toMatch(/db-reset\)\n\s+validate_database_environment\n\s+project_roots_export/)
  expect(developmentScript).toMatch(/db-reset-seed\)\n\s+validate_database_environment\n\s+project_roots_export/)
  expect(developmentScript).toMatch(
    /reset\)\n\s+validate_environment\n\s+validate_database_environment\n\s+project_roots_export/,
  )
})

test("managed preview layers optional checked-in defaults before the ignored environment file", () => {
  const defaultsEnvironmentFile = "EnvironmentFile=-%h/adaptive/codeline/ops/dev/codeline-defaults.env"
  const ignoredEnvironmentFile = "EnvironmentFile=%h/adaptive/codeline/.env"

  expect(serviceUnit).toContain(defaultsEnvironmentFile)
  expect(serviceUnit).toContain(ignoredEnvironmentFile)
  expect(serviceUnit.indexOf(defaultsEnvironmentFile)).toBeLessThan(serviceUnit.indexOf(ignoredEnvironmentFile))
  expect(checkedInDefaults).toContain('CODELINE_PROJECT_ROOTS=["../../leo","..","../../personal","."]')
  expect(checkedInDefaults).not.toContain("/home/")
  expect(checkedInDefaults).not.toContain("${HOME}")
})
