import { expect } from "@playwright/test"
import type { expiredCursorSetup } from "./expiredCursorSetup.js"
import { expiredCursorSnapshotRecordsRead } from "./expiredCursorSnapshotRecordsRead.js"
import { expiredCursorSelectedLiveUrlsRead } from "./expiredCursorSelectedLiveUrlsRead.js"
import { expiredCursorSessionRename } from "./expiredCursorSessionRename.js"

export async function expiredCursorBaselineAssert(
  setup: Awaited<ReturnType<typeof expiredCursorSetup>>,
  runId: string,
) {
  const { page, cachedSessionId, feedRequests, api } = setup
  await page.goto(`/sessions/${cachedSessionId}`)
  await expect(page.getByText("Build the workspace shell").first()).toBeVisible()
  await expect
    .poll(async () => (await expiredCursorSnapshotRecordsRead(page)).length, { timeout: 15_000 })
    .toBeGreaterThan(0)
  const recordsBefore = await expiredCursorSnapshotRecordsRead(page)
  expect(recordsBefore.find((record) => record.sessionId === cachedSessionId)).toBeDefined()
  await expect.poll(() => feedRequests.length, { timeout: 15_000 }).toBe(1)
  expect(feedRequests[0]?.after).toBeNull()
  await expect
    .poll(async () => (await expiredCursorSelectedLiveUrlsRead(page, cachedSessionId)).length, { timeout: 15_000 })
    .toBe(1)
  const initialSelectedSource = (await expiredCursorSelectedLiveUrlsRead(page, cachedSessionId))[0]
  if (initialSelectedSource === undefined) throw new Error("The selected-session stream did not attach.")
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const initialSelectedSourceUrl = new URL(initialSelectedSource, origin)
  const retainedSelectedCursor = initialSelectedSourceUrl.searchParams.get("after")
  if (retainedSelectedCursor === null) throw new Error("The selected-session stream did not retain a cursor.")
  const attachedTitle = `Build the workspace shell ${runId} attached`
  await expiredCursorSessionRename(api, cachedSessionId, attachedTitle)
  await expect(page.getByText(attachedTitle).first()).toBeVisible({ timeout: 30_000 })
  return { recordsBefore, initialSelectedSourceUrl, retainedSelectedCursor }
}
