import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { e2eExampleDataSeedRestore } from "../e2eExampleDataSeedForMember.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { newProjectFlowCleanup } from "./newProjectFlowCleanup.js"
import { newProjectFlowFirstMessageAction } from "./newProjectFlowFirstMessageAction.js"
import { newProjectFlowFirstMessageAssert } from "./newProjectFlowFirstMessageAssert.js"
import { newProjectFlowFirstMessageSetup } from "./newProjectFlowFirstMessageSetup.js"

export async function newProjectFlowFirstMessageStep(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let exampleDataSeeded = false
  let deletedUserIds: string[] = []
  let cleanupError: unknown
  try {
    const setup = await newProjectFlowFirstMessageSetup(
      browser,
      runId,
      () => {
        exampleDataSeeded = true
      },
      (opened) => {
        context = opened
      },
    )
    context = setup.context
    const { page, sessionId, prompt } = await newProjectFlowFirstMessageAction(context, setup.agentId, runId)
    await newProjectFlowFirstMessageAssert(context, page, sessionId, prompt)
  } finally {
    await context?.close()
    try {
      deletedUserIds = await newProjectFlowCleanup(runId, [])
    } catch (error) {
      cleanupError = error
    }
    if (exampleDataSeeded) {
      try {
        await e2eExampleDataSeedRestore()
      } catch (error) {
        cleanupError ??= error
      }
    }
  }
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
