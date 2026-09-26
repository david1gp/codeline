import type { Browser, BrowserContext } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { pinnedSessionsLandingAssert } from "./pinnedSessionsLandingAssert.js"
import { pinnedSessionsLandingCleanup } from "./pinnedSessionsLandingCleanup.js"
import { pinnedSessionsLandingSetup } from "./pinnedSessionsLandingSetup.js"

export async function pinnedSessionsLandingVerify(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  try {
    const setup = await pinnedSessionsLandingSetup(browser, runId)
    context = setup.context
    await pinnedSessionsLandingAssert(context, setup.mapping)
  } finally {
    await pinnedSessionsLandingCleanup(runId, context)
  }
}
