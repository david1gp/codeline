import { test } from "@playwright/test"
import { lunaSubagentThreadVerify } from "./lunaSubagentThreadVerify.js"

test("the deterministic simulation delegates and opens its completed child thread", async ({ browser }) => {
  test.setTimeout(180_000)
  await lunaSubagentThreadVerify(browser)
})
