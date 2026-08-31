import { expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const deploySource = path.join(repositoryRoot, "ops/deploy.sh")
const waitSource = path.join(repositoryRoot, "ops/dev/codeline-dev.sh")
const projectRootsSource = path.join(repositoryRoot, "ops/dev/codeline-project-roots.sh")
const readyResponse = '{"database":"ready","service":"codeline","status":"ready"}'

type HarnessOptions = {
  buildResult?: "success" | "fail"
  curlMode?: "ready" | "fail-new" | "never"
  curlDelay?: number
  initialDist?: "prior" | "none"
  initialTargetState?: "active" | "inactive"
  mvMode?: "normal" | "fail-stage" | "pause-stage"
  stopResult?: "success" | "fail-first" | "fail-second"
  targetStartResult?: "ready" | "fail-first" | "pause-first"
  waitTimeoutSeconds?: number
}

type Harness = {
  binDirectory: string
  deployPath: string
  directory: string
  liveDist: string
  markerPath: (name: string) => string
  releasePath: (name: string) => string
  root: string
  systemctlLog: string
  targetStatePath: string
  waitPath: string
  environment: Record<string, string>
}

type RunResult = {
  exitCode: number
  stderr: string
  stdout: string
}

const mockCommands: Record<string, string> = {
  bun: `#!/usr/bin/env bash
set -u
printf 'bun %s\\n' "$*" >> "$MOCK_BUN_LOG"
if [[ "$MOCK_BUILD_RESULT" == fail ]]; then exit 42; fi
mkdir -p "$CODELINE_BUILD_DIR/server" "$CODELINE_BUILD_DIR/ui"
printf 'new-build\\n' > "$CODELINE_BUILD_DIR/server/index.js"
printf '<!doctype html>\\n' > "$CODELINE_BUILD_DIR/ui/index.html"
`,
  curl: `#!/usr/bin/env bash
set -u
printf 'curl\\n' >> "$MOCK_CURL_LOG"
if [[ "$MOCK_CURL_DELAY" != 0 ]]; then /bin/sleep "$MOCK_CURL_DELAY"; fi
  case "$MOCK_CURL_MODE" in
  fail-new)
    start_count=0
    if [[ -f "$MOCK_SYSTEMCTL_START_COUNT" ]]; then IFS= read -r start_count < "$MOCK_SYSTEMCTL_START_COUNT"; fi
    if (( start_count >= 2 )); then
      printf '%s\\n200\\n' 'PLACEHOLDER_READY_RESPONSE'
    else
      printf 'not-ready\\n503\\n'
    fi
    ;;
  never) printf 'not-ready\\n503\\n' ;;
  *) printf '%s\\n200\\n' 'PLACEHOLDER_READY_RESPONSE' ;;
esac
`,
  git: `#!/usr/bin/env bash
set -u
printf '%s\\n' "$MOCK_ROOT"
`,
  mv: `#!/usr/bin/env bash
set -u
source_path="$2"
destination_path="$3"
if [[ "$MOCK_MV_MODE" == fail-stage && "$destination_path" == "$MOCK_ROOT/dist" && ! -f "$MOCK_MV_MARKER" ]]; then
  touch "$MOCK_MV_MARKER"
  exit 42
fi
/bin/mv "$@"
if [[ "$MOCK_MV_MODE" == pause-stage && "$destination_path" == "$MOCK_ROOT/dist" && ! -f "$MOCK_MV_MARKER" ]]; then
  touch "$MOCK_MV_MARKER"
  while [[ ! -f "$MOCK_MV_RELEASE" ]]; do /bin/sleep 0.01; done
fi
`,
  sleep: `#!/usr/bin/env bash
set -u
printf '%s\\n' "$*" >> "$MOCK_SLEEP_LOG"
if [[ "$MOCK_SLEEP_REAL" == true ]]; then /bin/sleep "$@"; fi
`,
  systemctl: `#!/usr/bin/env bash
set -u
printf '%s\\n' "$*" >> "$MOCK_SYSTEMCTL_LOG"
action="$2"
unit="\${3:-}"
set_target_state() {
  printf '%s\\n' "$1" > "$MOCK_SYSTEMCTL_STATE"
  printf '%s\\n' "$1" > "$MOCK_SYSTEMCTL_API_STATE"
}
  case "$action" in
  stop)
    stop_count=0
    if [[ -f "$MOCK_SYSTEMCTL_STOP_COUNT" ]]; then IFS= read -r stop_count < "$MOCK_SYSTEMCTL_STOP_COUNT"; fi
    stop_count=$((stop_count + 1))
    printf '%s\\n' "$stop_count" > "$MOCK_SYSTEMCTL_STOP_COUNT"
    if [[ "$MOCK_STOP_RESULT" == fail-first && "$stop_count" -eq 1 ]] ||
      [[ "$MOCK_STOP_RESULT" == fail-second && "$stop_count" -eq 2 ]]; then
      exit 42
    fi
    set_target_state inactive
    ;;
  start|restart)
    start_count=0
    if [[ -f "$MOCK_SYSTEMCTL_START_COUNT" ]]; then IFS= read -r start_count < "$MOCK_SYSTEMCTL_START_COUNT"; fi
    start_count=$((start_count + 1))
    printf '%s\\n' "$start_count" > "$MOCK_SYSTEMCTL_START_COUNT"
    if [[ "$MOCK_TARGET_START_RESULT" == fail-first && "$start_count" -eq 1 ]]; then exit 42; fi
    if [[ "$MOCK_TARGET_START_RESULT" == pause-first && "$start_count" -eq 1 ]]; then
      touch "$MOCK_RESTART_MARKER"
      while [[ ! -f "$MOCK_RESTART_RELEASE" ]]; do /bin/sleep 0.01; done
    fi
    set_target_state active
    ;;
  is-active)
    active_state=inactive
    if [[ -f "$MOCK_SYSTEMCTL_STATE" ]]; then IFS= read -r active_state < "$MOCK_SYSTEMCTL_STATE"; fi
    [[ "$unit" == --quiet ]] && unit="\${4:-}"
    [[ "$unit" == codeline-dev.target && "$active_state" == active ]]
    ;;
  *) exit 42 ;;
esac
`,
}

async function harnessCreate(options: HarnessOptions = {}): Promise<Harness> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-preview-deploy-"))
  const root = path.join(directory, "checkout")
  const home = path.join(directory, "home")
  const binDirectory = path.join(directory, "bin")
  const liveDist = path.join(root, "dist")
  const deployPath = path.join(root, "ops/deploy.sh")
  const waitPath = path.join(root, "ops/dev/codeline-dev.sh")
  const systemctlLog = path.join(directory, "systemctl.log")
  const apiState = path.join(directory, "api.state")
  const environment: Record<string, string> = {
    ...process.env,
    CODELINE_WAIT_TIMEOUT_SECONDS: String(options.waitTimeoutSeconds ?? 2),
    HOME: home,
    MOCK_BUILD_RESULT: options.buildResult ?? "success",
    MOCK_CURL_DELAY: String(options.curlDelay ?? 0),
    MOCK_CURL_LOG: path.join(directory, "curl.log"),
    MOCK_CURL_MODE: options.curlMode ?? "ready",
    MOCK_MV_MARKER: path.join(directory, "mv.marker"),
    MOCK_MV_MODE: options.mvMode ?? "normal",
    MOCK_MV_RELEASE: path.join(directory, "mv.release"),
    MOCK_ROOT: root,
    MOCK_SLEEP_LOG: path.join(directory, "sleep.log"),
    MOCK_SLEEP_REAL: "false",
    MOCK_STOP_RESULT: options.stopResult ?? "success",
    MOCK_RESTART_MARKER: path.join(directory, "restart.marker"),
    MOCK_RESTART_RELEASE: path.join(directory, "restart.release"),
    MOCK_TARGET_START_RESULT: options.targetStartResult ?? "ready",
    MOCK_SYSTEMCTL_LOG: systemctlLog,
    MOCK_SYSTEMCTL_API_STATE: apiState,
    MOCK_SYSTEMCTL_START_COUNT: path.join(directory, "start.count"),
    MOCK_SYSTEMCTL_STOP_COUNT: path.join(directory, "stop.count"),
    MOCK_SYSTEMCTL_STATE: path.join(directory, "systemctl.state"),
    MOCK_BUN_LOG: path.join(directory, "bun.log"),
    PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
  }

  await fs.mkdir(path.join(root, "ops/dev"), { recursive: true })
  const initialDist = options.initialDist ?? "prior"
  const initialTargetState = options.initialTargetState ?? (initialDist === "prior" ? "active" : "inactive")
  if (initialDist === "prior") await fs.mkdir(liveDist, { recursive: true })
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(binDirectory, { recursive: true })
  await fs.mkdir(path.join(home, "adaptive"), { recursive: true })
  await fs.symlink(root, path.join(home, "adaptive/codeline"))
  await fs.writeFile(
    path.join(root, ".env"),
    `
NODE_ENV=development
AUTH_MODE=development
PUBLIC_ORIGIN=https://preview.codeline.work
HOST=0.0.0.0
PORT=6001
DEVELOPMENT_IDENTITY_KEY=local-development
DEVELOPMENT_IDENTITY_DISPLAY_NAME=Local Development
SESSION_SECRET=test-session-secret
CONFIG_STORE_DIR=./data/config
`,
  )
  if (initialDist === "prior") await fs.writeFile(path.join(liveDist, "server.js"), "prior-build\n")
  await fs.writeFile(path.join(directory, "systemctl.state"), `${initialTargetState}\n`)
  await fs.writeFile(apiState, `${initialTargetState}\n`)
  await fs.copyFile(deploySource, deployPath)
  await fs.copyFile(waitSource, waitPath)
  await fs.copyFile(projectRootsSource, path.join(root, "ops/dev/codeline-project-roots.sh"))

  for (const [command, source] of Object.entries(mockCommands)) {
    const commandPath = path.join(binDirectory, command)
    await fs.writeFile(commandPath, source.replaceAll("PLACEHOLDER_READY_RESPONSE", readyResponse))
    await fs.chmod(commandPath, 0o755)
  }

  return {
    binDirectory,
    deployPath,
    directory,
    environment,
    liveDist,
    markerPath: (name) => path.join(directory, `${name}.marker`),
    releasePath: (name) => path.join(directory, `${name}.release`),
    root,
    systemctlLog,
    targetStatePath: path.join(directory, "systemctl.state"),
    waitPath,
  }
}

async function harnessRun(harness: Harness, command: string[]): Promise<RunResult> {
  const child = Bun.spawn(command, { env: harness.environment, stderr: "pipe", stdout: "pipe" })
  const [stderr, stdout, exitCode] = await Promise.all([
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
    child.exited,
  ])
  return { exitCode, stderr, stdout }
}

async function fileWait(pathname: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (
      await fs
        .access(pathname)
        .then(() => true)
        .catch(() => false)
    ) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${pathname}`)
}

async function fileReadOrEmpty(pathname: string): Promise<string> {
  return fs.readFile(pathname, "utf8").catch(() => "")
}

async function harnessDispose(harness: Harness) {
  await fs.rm(harness.directory, { force: true, recursive: true })
}

test("a fresh checkout deploys without a prior dist and leaves the managed target active", async () => {
  const harness = await harnessCreate({ initialDist: "none" })
  try {
    expect(await fileReadOrEmpty(harness.liveDist)).toBe("")
    const result = await harnessRun(harness, ["bash", harness.deployPath])
    const systemctlLog = await fileReadOrEmpty(harness.systemctlLog)

    expect(result.exitCode).toBe(0)
    expect(await fs.readFile(path.join(harness.liveDist, "server", "index.js"), "utf8")).toBe("new-build\n")
    expect(await fs.readFile(path.join(harness.liveDist, "ui", "index.html"), "utf8")).toBe("<!doctype html>\n")
    expect(await fs.readFile(harness.targetStatePath, "utf8")).toBe("active\n")
    expect(systemctlLog).toContain("--user stop codeline-dev.target")
    expect(systemctlLog).toContain("--user start codeline-dev.target")
    expect(systemctlLog).toContain("--user is-active --quiet codeline-dev.target")
  } finally {
    await harnessDispose(harness)
  }
})

test("a failed first deployment removes the failed build and leaves the managed target stopped", async () => {
  const harness = await harnessCreate({ initialDist: "none", curlMode: "never", waitTimeoutSeconds: 1 })
  try {
    harness.environment.MOCK_SLEEP_REAL = "true"
    const result = await harnessRun(harness, ["bash", harness.deployPath])
    const liveDistExists = await fs
      .access(harness.liveDist)
      .then(() => true)
      .catch(() => false)

    expect(result.exitCode).not.toBe(0)
    expect(liveDistExists).toBe(false)
    expect(await fs.readFile(harness.targetStatePath, "utf8")).toBe("inactive\n")
    expect(result.stderr).toContain("api did not become available")
    expect(result.stderr).toContain("deployment failed with no prior build")
    expect(result.stderr).toContain("confirmed stopped")
    expect(result.stderr).not.toContain("prior build was restored")
    expect(result.stderr).not.toContain("ready again")
  } finally {
    await harnessDispose(harness)
  }
})

test("a build failure leaves the live build and managed service untouched", async () => {
  const harness = await harnessCreate({ buildResult: "fail" })
  try {
    const result = await harnessRun(harness, ["bash", harness.deployPath])
    const systemctlLog = await fileReadOrEmpty(harness.systemctlLog)
    const liveBuild = await fs.readFile(path.join(harness.liveDist, "server.js"), "utf8")

    expect(result.exitCode).not.toBe(0)
    expect(systemctlLog).toBe("")
    expect(await fileReadOrEmpty(harness.environment.MOCK_CURL_LOG!)).toBe("")
    expect(liveBuild).toBe("prior-build\n")
    expect(await fs.readFile(harness.targetStatePath, "utf8")).toBe("active\n")
    expect(result.stderr).toContain("build failed")
  } finally {
    await harnessDispose(harness)
  }
})

test("an invalid runtime configuration fails before the build or service stop", async () => {
  const harness = await harnessCreate()
  try {
    const environmentFile = path.join(harness.root, ".env")
    const environment = await fs.readFile(environmentFile, "utf8")
    await fs.writeFile(environmentFile, environment.replace("SESSION_SECRET=test-session-secret\n", ""))
    const result = await harnessRun(harness, ["bash", harness.deployPath])

    expect(result.exitCode).not.toBe(0)
    expect(await fileReadOrEmpty(harness.systemctlLog)).toBe("")
    expect(await fileReadOrEmpty(harness.environment.MOCK_BUN_LOG!)).toBe("")
    expect(result.stderr).toContain("SESSION_SECRET")
  } finally {
    await harnessDispose(harness)
  }
})

test("explicit provider validation accepts Authworks generic IDs but rejects incomplete Zitadel", async () => {
  const harness = await harnessCreate()
  try {
    const environmentFile = path.join(harness.root, ".env")
    const environment = await fs.readFile(environmentFile, "utf8")
    await fs.writeFile(
      environmentFile,
      `${environment.replace("AUTH_MODE=development", "AUTH_MODE=oidc")}\nOIDC_AUTHWORKS_ISSUER=https://authworks.example.test\nOIDC_AUTHWORKS_ORGANIZATION_ID=organization-id\nOIDC_ZITADEL_ISSUER=https://zitadel.example.test\nOIDC_ZITADEL_ORGANIZATION_ID=organization-id\nOIDC_CLIENT_ID=generic-client-id\n`,
    )
    const result = await harnessRun(harness, ["bash", harness.deployPath])

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("the Zitadel client ID")
    expect(await fileReadOrEmpty(harness.systemctlLog)).toBe("")
    expect(await fileReadOrEmpty(harness.environment.MOCK_BUN_LOG!)).toBe("")
  } finally {
    await harnessDispose(harness)
  }
})

test("a failed staged swap restores the prior build and restarts the managed target", async () => {
  const harness = await harnessCreate({ mvMode: "fail-stage" })
  try {
    const result = await harnessRun(harness, ["bash", harness.deployPath])
    const systemctlLog = await fileReadOrEmpty(harness.systemctlLog)
    const liveBuild = await fs.readFile(path.join(harness.liveDist, "server.js"), "utf8")

    expect(result.exitCode).not.toBe(0)
    expect(liveBuild).toBe("prior-build\n")
    expect(await fs.readFile(harness.targetStatePath, "utf8")).toBe("active\n")
    expect(systemctlLog).toContain("--user stop codeline-dev.target")
    expect(systemctlLog).toContain("--user start codeline-dev.target")
    expect(systemctlLog).toContain("--user is-active --quiet codeline-dev.target")
    expect(result.stderr).toContain("prior build was restored")
  } finally {
    await harnessDispose(harness)
  }
})

test("SIGTERM during the staged swap restores the prior build and healthy API", async () => {
  const harness = await harnessCreate({ mvMode: "pause-stage" })
  try {
    const child = Bun.spawn(["bash", harness.deployPath], {
      env: harness.environment,
      stderr: "pipe",
      stdout: "pipe",
    })
    await fileWait(harness.markerPath("mv"))
    process.kill(child.pid, "SIGTERM")
    await fs.writeFile(harness.releasePath("mv"), "release\n")
    const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited])
    const liveBuild = await fs.readFile(path.join(harness.liveDist, "server.js"), "utf8")
    const systemctlLog = await fs.readFile(harness.systemctlLog, "utf8")

    expect(exitCode).toBe(143)
    expect(liveBuild).toBe("prior-build\n")
    expect(await fs.readFile(harness.targetStatePath, "utf8")).toBe("active\n")
    expect(systemctlLog).toContain("--user stop codeline-dev.target")
    expect(systemctlLog).toContain("--user start codeline-dev.target")
    expect(stderr).toContain("received TERM")
    expect(stderr).toContain("prior build was restored")
  } finally {
    await harnessDispose(harness)
  }
})

test("a target start failure rolls back to the prior build and confirms it is ready", async () => {
  const harness = await harnessCreate({ targetStartResult: "fail-first", curlMode: "fail-new" })
  try {
    const result = await harnessRun(harness, ["bash", harness.deployPath])
    const liveBuild = await fs.readFile(path.join(harness.liveDist, "server.js"), "utf8")
    const startCount = await fs.readFile(harness.environment.MOCK_SYSTEMCTL_START_COUNT!, "utf8")

    expect(result.exitCode).not.toBe(0)
    expect(liveBuild).toBe("prior-build\n")
    expect(startCount.trim()).toBe("2")
    expect(await fs.readFile(harness.targetStatePath, "utf8")).toBe("active\n")
    expect(result.stderr).toContain("prior build was restored")
  } finally {
    await harnessDispose(harness)
  }
})

test("a rollback target-stop failure does not restore the prior build or claim recovery", async () => {
  const harness = await harnessCreate({ curlMode: "never", stopResult: "fail-second", waitTimeoutSeconds: 1 })
  try {
    harness.environment.MOCK_SLEEP_REAL = "true"
    const result = await harnessRun(harness, ["bash", harness.deployPath])
    const liveBuild = await fs.readFile(path.join(harness.liveDist, "server", "index.js"), "utf8")

    expect(result.exitCode).not.toBe(0)
    expect(liveBuild).toBe("new-build\n")
    expect(await fs.readFile(harness.targetStatePath, "utf8")).toBe("active\n")
    expect(result.stderr).toContain("filesystem restoration was not attempted")
    expect(result.stderr).toContain("rollback failed because the managed target could not be stopped")
    expect(result.stderr).not.toContain("prior build was restored")
  } finally {
    await harnessDispose(harness)
  }
})

test("readiness does not sleep again after a probe reaches its deadline", async () => {
  const harness = await harnessCreate({ curlDelay: 2, curlMode: "never", waitTimeoutSeconds: 1 })
  try {
    harness.environment.MOCK_SLEEP_REAL = "true"
    const result = await harnessRun(harness, ["bash", harness.waitPath, "wait", "api"])
    const curlLog = await fs.readFile(harness.environment.MOCK_CURL_LOG!, "utf8")
    const sleepLog = await fileReadOrEmpty(harness.environment.MOCK_SLEEP_LOG!)

    expect(result.exitCode).not.toBe(0)
    expect(curlLog.trim().split("\n")).toHaveLength(1)
    expect(sleepLog).toBe("")
    expect(result.stderr).toContain("api did not become available")
  } finally {
    await harnessDispose(harness)
  }
})
