import { type Browser, type BrowserContext } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { contextCompactionSessionCreate } from "./contextCompactionSessionCreate.js"
import { contextCompactionHistorySubmit } from "./contextCompactionHistorySubmit.js"
import { contextCompactionManualAssert } from "./contextCompactionManualAssert.js"
import { contextCompactionReloadAssert } from "./contextCompactionReloadAssert.js"
import { contextCompactionFollowUpAssert } from "./contextCompactionFollowUpAssert.js"
import { contextCompactionArgumentReject } from "./contextCompactionArgumentReject.js"
import { contextCompactionSetup } from "./contextCompactionSetup.js"
import { contextCompactionCleanup } from "./contextCompactionCleanup.js"

export async function contextCompactionVerify(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  try {
    const setup = await contextCompactionSetup(browser, runId)
    context = setup.context

    const sessionId = await contextCompactionSessionCreate(context, runId, setup.mapping)
    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)

    const { historyPrompts, sourceMessages } = await contextCompactionHistorySubmit(page, context, sessionId, runId)
    await contextCompactionManualAssert(page, context, sessionId, historyPrompts, sourceMessages)
    await contextCompactionReloadAssert(page, context, sessionId, historyPrompts, sourceMessages)
    await contextCompactionFollowUpAssert(page, context, sessionId, runId, historyPrompts.length)
    await contextCompactionArgumentReject(page, context, sessionId)
  } finally {
    await contextCompactionCleanup(runId, context)
  }
}
