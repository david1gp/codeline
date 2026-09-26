import { type BrowserContext, test } from "@playwright/test"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { asyncMarkdownRenderingAction } from "./asyncMarkdownRenderingAction.js"
import { asyncMarkdownRenderingAssert } from "./asyncMarkdownRenderingAssert.js"
import { asyncMarkdownRenderingCleanup } from "./asyncMarkdownRenderingCleanup.js"
import { asyncMarkdownRenderingSetup } from "./asyncMarkdownRenderingSetup.js"

test("the managed preview renders submitted Markdown with the bundled worker", async ({ browser }) => {
  test.setTimeout(180_000)
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  try {
    const { context, mapping } = await asyncMarkdownRenderingSetup(browser, runId)
    contexts.push(context)
    const page = await context.newPage()
    const { inFlightMessages, markdownPrompt } = await asyncMarkdownRenderingAction(
      page,
      mapping["session:example-session-simulation-streaming"],
    )
    await asyncMarkdownRenderingAssert(page, inFlightMessages, markdownPrompt)
  } finally {
    await asyncMarkdownRenderingCleanup(runId, contexts)
  }
})
