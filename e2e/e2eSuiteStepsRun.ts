import { spawn } from "node:child_process"
import type { E2eCheckpoint } from "./e2eCheckpointSchema.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"
import type { E2eSuite } from "./e2eSuiteSchema.js"

/** A workflow completes only after every step succeeds; no parallel Playwright processes. */
export async function e2eSuiteStepsRun(
  suite: E2eSuite,
  checkpoint: E2eCheckpoint,
  execute: (args: string[], env: NodeJS.ProcessEnv) => Promise<void> = async (args, env) => {
    await new Promise<void>((resolveRun, rejectRun) => {
      const child = spawn("bunx", args, { cwd: e2eRepositoryRoot, stdio: "inherit", env })
      child.once("error", rejectRun)
      child.once("exit", (code, signal) => {
        if (code === 0) resolveRun()
        else rejectRun(new Error(`E2E step ${args[2]} exited with ${code ?? signal}`))
      })
    })
  },
): Promise<void> {
  for (const step of suite.steps) {
    console.info(`E2E ${checkpoint.target} ${checkpoint.runId}: ${step}`)
    await execute(["playwright", "test", step, "--workers=1"], {
      ...process.env,
      PUBLIC_ORIGIN: checkpoint.origin,
      E2E_RUN_ID: checkpoint.runId,
      E2E_TARGET: checkpoint.target,
    })
  }
}
