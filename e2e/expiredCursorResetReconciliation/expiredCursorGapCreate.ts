import { expect } from "@playwright/test"
import { e2eJournalEventsPrune } from "../e2eJournalEventsPrune.js"
import type { expiredCursorSetup } from "./expiredCursorSetup.js"
import { expiredCursorSelectedClosedUrlsRead } from "./expiredCursorSelectedClosedUrlsRead.js"
import { expiredCursorSessionRename } from "./expiredCursorSessionRename.js"

export async function expiredCursorGapCreate(
  setup: Awaited<ReturnType<typeof expiredCursorSetup>>,
  runId: string,
  initialSelectedSourceUrl: URL,
): Promise<string> {
  const { context, page, api, cachedSessionId, member } = setup
  await context.setOffline(true)
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window.__codelineEventFeedClosedUrls ?? []).filter(
              (url) => new URL(url, window.location.origin).pathname === "/api/events",
            ).length,
        ),
      { timeout: 15_000 },
    )
    .toBe(1)
  await expect
    .poll(async () => (await expiredCursorSelectedClosedUrlsRead(page, cachedSessionId)).length, { timeout: 15_000 })
    .toBe(1)
  expect(await expiredCursorSelectedClosedUrlsRead(page, cachedSessionId)).toContain(initialSelectedSourceUrl.href)
  const title = `Build the workspace shell ${runId}`
  await expiredCursorSessionRename(api, cachedSessionId, `${title} gap`)
  await expiredCursorSessionRename(api, cachedSessionId, `${title} expired`)
  const pruned = await e2eJournalEventsPrune(runId)
  const memberPrune = pruned.find((entry) => entry.userId === member.userId)
  expect(memberPrune?.prunedEventCount ?? 0).toBeGreaterThan(0)
  expect(memberPrune?.prunedThroughSequence ?? 0).toBeGreaterThan(0)
  const postResetTitle = `${title} postReset`
  await expiredCursorSessionRename(api, cachedSessionId, postResetTitle)
  return postResetTitle
}
