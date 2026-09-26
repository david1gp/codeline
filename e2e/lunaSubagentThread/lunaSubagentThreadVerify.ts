import type { Browser, BrowserContext } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { lunaChildThreadAssert } from "./lunaChildThreadAssert.js"
import { lunaDelegationAwait } from "./lunaDelegationAwait.js"
import { lunaDelegationSubmit } from "./lunaDelegationSubmit.js"
import { lunaSubagentThreadCleanup } from "./lunaSubagentThreadCleanup.js"
import { lunaSubagentThreadSetup } from "./lunaSubagentThreadSetup.js"

export async function lunaSubagentThreadVerify(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  try {
    const { context, simulationAgentId, simulationSessionId } = await lunaSubagentThreadSetup(browser, runId)
    contexts.push(context)
    const page = await context.newPage()
    await lunaDelegationSubmit(page, simulationSessionId)
    const childRunId = await lunaDelegationAwait(context, simulationSessionId, simulationAgentId)
    await lunaChildThreadAssert(page, childRunId)
  } finally {
    await lunaSubagentThreadCleanup(runId, contexts)
  }
}
