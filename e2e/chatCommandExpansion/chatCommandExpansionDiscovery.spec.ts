import { test } from "@playwright/test"
import { chatCommandExpansionDiscoveryStep } from "./chatCommandExpansionDiscoveryStep.js"

test("the composer discovers, previews, and submits project slash commands", async ({ browser }) => {
  test.setTimeout(240_000)
  await chatCommandExpansionDiscoveryStep(browser)
})
