import { expect, type Locator } from "@playwright/test"

export async function asyncMarkdownWorkerAssert(submittedInFlightMessage: Locator) {
  await expect(submittedInFlightMessage).toBeVisible({ timeout: 45_000 })

  // The raw fallback is a transient pre-render state, so only its replacement by
  // worker-rendered HTML is asserted; the fallback itself may never be observed.
  const submittedHtml = submittedInFlightMessage.locator(
    ".markdown-content--message:not(.markdown-content--message-fallback)",
  )
  await expect(submittedHtml.locator("h1")).toBeVisible({ timeout: 45_000 })
  await expect(submittedHtml.locator("h1")).toHaveText("Browser worker Markdown")
  await expect(submittedHtml.locator("strong")).toBeVisible({ timeout: 45_000 })
  await expect(submittedHtml.locator("strong")).toHaveText("bold fallback")
  await expect(submittedInFlightMessage.locator(".markdown-content--message-fallback")).toHaveCount(0)
}
