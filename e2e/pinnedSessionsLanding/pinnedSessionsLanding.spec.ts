import { test } from "@playwright/test"
import { pinnedSessionsLandingVerify } from "./pinnedSessionsLandingVerify.js"

test("signed-in pinned sessions landing does not report a missing project", async ({ browser }) => {
  await pinnedSessionsLandingVerify(browser)
})
