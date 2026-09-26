import { expect } from "@playwright/test"
import type { expiredCursorSetup } from "./expiredCursorSetup.js"
import { expiredCursorSelectedClosedUrlsRead } from "./expiredCursorSelectedClosedUrlsRead.js"
import { expiredCursorSelectedLiveUrlsRead } from "./expiredCursorSelectedLiveUrlsRead.js"

export async function expiredCursorRecoveryAssert(
  setup: Awaited<ReturnType<typeof expiredCursorSetup>>,
  reconnectIndex: number,
  reconciliationStart: number,
  retainedSelectedCursor: string,
  postResetTitle: string,
) {
  const { feedRequests, httpRequests, cachedSessionId, page } = setup
  const recoveryFeedRequests = () => feedRequests.slice(reconnectIndex)
  await expect
    .poll(
      () => {
        const [reset, fresh] = recoveryFeedRequests()
        return (
          reset?.status === 400 &&
          typeof reset.after === "string" &&
          typeof fresh?.after === "string" &&
          reset.after !== fresh.after
        )
      },
      { timeout: 60_000 },
    )
    .toBe(true)
  const resetAttach = recoveryFeedRequests()[0]
  const freshAttach = recoveryFeedRequests()[1]
  expect(resetAttach?.status).toBe(400)
  expect(resetAttach?.after).toEqual(expect.any(String))
  expect(freshAttach?.after).toEqual(expect.any(String))
  expect(freshAttach?.after).not.toBe(resetAttach?.after)

  const reconciliation = () => httpRequests.slice(reconciliationStart)
  const selectedSnapshotPath = `/api/sessions/${cachedSessionId}/bounded-snapshot`
  await expect
    .poll(
      () =>
        reconciliation().some(
          (entry) =>
            entry.method === "GET" &&
            entry.path.startsWith("/api/sessions?") &&
            entry.status !== undefined &&
            entry.finishedOrder !== undefined,
        ),
      { timeout: 60_000 },
    )
    .toBe(true)
  const listResponse = reconciliation().find(
    (entry) =>
      entry.method === "GET" &&
      entry.path.startsWith("/api/sessions?") &&
      entry.status !== undefined &&
      entry.finishedOrder !== undefined,
  )
  expect(listResponse).toBeDefined()
  expect([200, 304]).toContain(listResponse?.status)
  await expect
    .poll(
      () =>
        reconciliation().some(
          (entry) =>
            entry.method === "GET" &&
            entry.path === selectedSnapshotPath &&
            entry.status !== undefined &&
            entry.finishedOrder !== undefined,
        ),
      { timeout: 60_000 },
    )
    .toBe(true)
  const selectedSnapshotRequest = reconciliation().find(
    (entry) =>
      entry.method === "GET" &&
      entry.path === selectedSnapshotPath &&
      entry.status !== undefined &&
      entry.finishedOrder !== undefined,
  )
  expect(selectedSnapshotRequest).toBeDefined()
  if (selectedSnapshotRequest === undefined || selectedSnapshotRequest.finishedOrder === undefined)
    throw new Error("The selected-session snapshot request did not complete.")
  expect(selectedSnapshotRequest.status).toBe(200)
  await expect(page.getByText(postResetTitle).first()).toBeVisible({ timeout: 60_000 })
  await expect
    .poll(async () => (await expiredCursorSelectedLiveUrlsRead(page, cachedSessionId)).length, { timeout: 60_000 })
    .toBe(1)
  const currentSelectedSource = (await expiredCursorSelectedLiveUrlsRead(page, cachedSessionId))[0]
  if (currentSelectedSource === undefined) throw new Error("The selected-session stream did not remain attached.")
  const selectedClosedAfterSnapshot = (await expiredCursorSelectedClosedUrlsRead(page, cachedSessionId)).length
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const currentSelectedSourceUrl = new URL(currentSelectedSource, origin)
  const freshSelectedRequest = reconciliation().find(
    (entry) =>
      entry.method === "GET" && entry.path === `${currentSelectedSourceUrl.pathname}${currentSelectedSourceUrl.search}`,
  )
  expect(freshSelectedRequest).toBeDefined()
  if (freshSelectedRequest === undefined) throw new Error("The fresh selected-session stream request was not tracked.")
  const freshSelectedCursor = new URL(freshSelectedRequest.path, origin).searchParams.get("after")
  expect(freshSelectedCursor).not.toBeNull()
  expect(freshSelectedCursor).not.toBe(retainedSelectedCursor)
  expect(selectedSnapshotRequest.finishedOrder).toBeLessThan(freshSelectedRequest.requestOrder)
  return { currentSelectedSource, selectedClosedAfterSnapshot }
}
