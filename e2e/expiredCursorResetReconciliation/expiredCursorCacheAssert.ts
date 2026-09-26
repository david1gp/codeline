import { expect } from "@playwright/test"
import type { expiredCursorSetup } from "./expiredCursorSetup.js"
import { expiredCursorSnapshotRecordsRead } from "./expiredCursorSnapshotRecordsRead.js"
import { expiredCursorSelectedClosedUrlsRead } from "./expiredCursorSelectedClosedUrlsRead.js"
import { expiredCursorSelectedLiveUrlsRead } from "./expiredCursorSelectedLiveUrlsRead.js"

export async function expiredCursorCacheAssert(
  setup: Awaited<ReturnType<typeof expiredCursorSetup>>,
  recordsBefore: Array<Record<string, unknown>>,
  currentSelectedSource: string,
  selectedClosedAfterSnapshot: number,
): Promise<void> {
  const { page, cachedSessionId, feedRequests } = setup
  const recordsAfter = await expiredCursorSnapshotRecordsRead(page)
  expect(recordsAfter.some((record) => record.sessionId === cachedSessionId)).toBe(true)
  expect(recordsAfter.length).toBeGreaterThanOrEqual(recordsBefore.length)
  const recordKeysBefore = recordsBefore.map((record) => `${String(record.userId)}:${String(record.sessionId)}`)
  const recordKeysAfter = new Set(recordsAfter.map((record) => `${String(record.userId)}:${String(record.sessionId)}`))
  for (const recordKey of recordKeysBefore) expect(recordKeysAfter.has(recordKey)).toBe(true)
  const finalFeed = feedRequests.length
  await page.waitForTimeout(2_000)
  expect(feedRequests.length).toBe(finalFeed)
  expect(await expiredCursorSelectedClosedUrlsRead(page, cachedSessionId)).toHaveLength(selectedClosedAfterSnapshot)
  expect(await expiredCursorSelectedLiveUrlsRead(page, cachedSessionId)).toEqual([currentSelectedSource])
}
