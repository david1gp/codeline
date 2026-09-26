import { defineConfig } from "@playwright/test"
import { e2eEnvironmentFileLoad } from "./e2e/e2eEnvironmentFileLoad.js"

/**
 * The end-to-end run targets the repository-managed preview services. It never starts
 * application or dependency processes of its own, so `./ops/dev/codeline-dev.sh` must
 * already be running. The local `.env` is loaded first so the run and its setup and
 * cleanup scripts read the same managed development values.
 */
e2eEnvironmentFileLoad()

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: true,
  fullyParallel: false,
  reporter: [["list"]],
  retries: 0,
  testDir: "./e2e",
  use: {
    baseURL: process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work",
    trace: "off",
  },
  workers: 1,
})
