import { e2eCheckpointRecover } from "../e2e/e2eCheckpointRecover.js"
import { e2eCheckpointStoreCreate } from "../e2e/e2eCheckpointStoreCreate.js"
import { e2eEnvironmentFileLoad } from "../e2e/e2eEnvironmentFileLoad.js"
import { e2eFixtureCleanupCreate } from "../e2e/e2eFixtureCleanupCreate.js"

// Intentionally no expiry scan or suite execution: this command touches only the
// explicitly named production checkpoint and its registered, API-verified fixtures.
const runId = process.argv[2]
if (runId === undefined || process.argv.length !== 3)
  throw new Error("Usage: bun scripts/e2eCheckpointRecoverMain.ts <runId>")
e2eEnvironmentFileLoad()
const token = process.env.E2E_FIXTURE_API_TOKEN
if (!token) throw new Error("E2E_FIXTURE_API_TOKEN is required")
const origin = "https://preview.codeline.work"
const recovered = await e2eCheckpointRecover({
  runId,
  target: "production",
  origin,
  store: e2eCheckpointStoreCreate(),
  cleanup: e2eFixtureCleanupCreate(token, { production: origin, dev: process.env.E2E_DEV_ORIGIN ?? origin }),
})
if (!recovered.success) throw new Error(recovered.errorMessage, { cause: recovered })
console.info(`Recovered production checkpoint ${runId}; verified absent fixture IDs: ${recovered.data.join(", ")}`)
