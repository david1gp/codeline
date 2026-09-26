import { e2eEnvironmentFileLoad } from "../e2e/e2eEnvironmentFileLoad.js"
import { e2eLifecycleVerify } from "../e2e/e2eLifecycleVerify.js"

e2eEnvironmentFileLoad()
await e2eLifecycleVerify(process.env.E2E_FIXTURE_API_TOKEN ?? "")
