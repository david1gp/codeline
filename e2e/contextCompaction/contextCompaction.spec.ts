import { test } from "@playwright/test"
import { contextCompactionVerify } from "./contextCompactionVerify.js"

test("manual deterministic compaction stays transient across completion and reload", async ({ browser }) => {
  test.setTimeout(240_000)
  await contextCompactionVerify(browser)
})
