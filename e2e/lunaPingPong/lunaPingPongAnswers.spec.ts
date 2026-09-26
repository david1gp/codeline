import { type BrowserContext, test } from "@playwright/test"
import { lunaPingPongAction } from "./lunaPingPongAction.js"
import { lunaPingPongAssert } from "./lunaPingPongAssert.js"
import { lunaPingPongCleanup } from "./lunaPingPongCleanup.js"
import { lunaPingPongSetup } from "./lunaPingPongSetup.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"

test("Luna answers ping with a finalized pong", async ({ browser }) => {
  test.setTimeout(180_000)
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let cleanupError: unknown
  try {
    const sessionId = await lunaPingPongSetup(browser, runId, contexts)
    const page = await lunaPingPongAction(contexts[0]!, sessionId)
    await lunaPingPongAssert(page)
  } finally {
    try {
      await lunaPingPongCleanup(runId, contexts)
    } catch (error) {
      cleanupError = error
    }
  }
  if (cleanupError !== undefined) throw cleanupError
})
