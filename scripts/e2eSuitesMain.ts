import { spawn } from "node:child_process"
import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { e2eCheckpointStoreCreate } from "../e2e/e2eCheckpointStoreCreate.js"
import { e2eEnvironmentFileLoad } from "../e2e/e2eEnvironmentFileLoad.js"
import { e2eFixtureCleanupCreate } from "../e2e/e2eFixtureCleanupCreate.js"
import { e2eExpiredFixturesCleanupCreate } from "../e2e/e2eExpiredFixturesCleanupCreate.js"
import { e2eRepositoryRoot } from "../e2e/e2eRepositoryRoot.js"
import { e2eSuitesRun } from "../e2e/e2eSuitesRun.js"

e2eEnvironmentFileLoad()
const mode = process.argv[2]
if (mode !== "production" && mode !== "dev") throw new Error("Specify production or dev target")
const devOrigin = process.env.E2E_DEV_ORIGIN ?? process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const origin = mode === "production" ? "https://preview.codeline.work" : devOrigin
if (!origin.startsWith("https://") || new URL(origin).origin !== origin)
  throw new Error("E2E_DEV_ORIGIN must be an HTTPS origin for dev mode")
const token = process.env.E2E_FIXTURE_API_TOKEN
if (!token) throw new Error("E2E_FIXTURE_API_TOKEN is required")

const suites = (await readdir(resolve(e2eRepositoryRoot, "e2e")))
  .filter((name) => name.endsWith(".spec.ts"))
  .map((name) => `e2e/${name}`)
  .sort()
if (suites.length === 0) throw new Error("No E2E suites discovered")
await e2eSuitesRun({
  target: mode,
  origin,
  suites,
  store: e2eCheckpointStoreCreate(),
  cleanup: e2eFixtureCleanupCreate(token, { production: "https://preview.codeline.work", dev: devOrigin }),
  cleanupExpiredServerRuns: e2eExpiredFixturesCleanupCreate(token, { production: "https://preview.codeline.work", dev: devOrigin }),
  suiteRun: async (suite, checkpoint) => {
    const args = ["playwright", "test", suite, "--workers=1"]
    console.info(`E2E ${checkpoint.target} ${checkpoint.runId}: ${suite}`)
    await new Promise<void>((resolveRun, rejectRun) => {
      const child = spawn("bunx", args, {
        cwd: e2eRepositoryRoot,
        stdio: "inherit",
        env: { ...process.env, PUBLIC_ORIGIN: origin, E2E_RUN_ID: checkpoint.runId, E2E_TARGET: mode },
      })
      child.once("error", rejectRun)
      child.once("exit", (code, signal) => {
        if (code === 0) resolveRun()
        else rejectRun(new Error(`E2E suite ${suite} exited with ${code ?? signal}`))
      })
    })
  },
})
