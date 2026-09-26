import { type BrowserContext, test } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { organizationSharedAccessAction } from "./organizationSharedAccessAction.js"
import { organizationSharedAccessAssert } from "./organizationSharedAccessAssert.js"
import { organizationSharedAccessCleanup } from "./organizationSharedAccessCleanup.js"
import { organizationSharedAccessSetup } from "./organizationSharedAccessSetup.js"

test("organization members share targets while personal sessions stay private", async ({ browser }) => {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let cleanupError: unknown
  try {
    await organizationSharedAccessSetup(browser, runId, contexts)
    const data = await organizationSharedAccessAction(contexts[0]!, contexts[1]!, runId)
    await organizationSharedAccessAssert(contexts[0]!, contexts[1]!, data)
  } finally {
    try {
      await organizationSharedAccessCleanup(runId, contexts)
    } catch (error) {
      cleanupError = error
    }
  }
  if (cleanupError !== undefined) throw cleanupError
})
