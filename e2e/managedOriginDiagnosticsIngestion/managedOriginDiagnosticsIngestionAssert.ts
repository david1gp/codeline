import { expect } from "@playwright/test"
import { e2eFixtureDiagnosticsRead } from "../e2eFixtureDiagnosticsRead.js"

export async function managedOriginDiagnosticsIngestionAssert(
  runId: string,
  marker: string,
  failedPath: string,
  secret: string,
  userId: string,
) {
  await expect
    .poll(
      async () => {
        const entries = await e2eFixtureDiagnosticsRead(runId)
        return entries.filter((entry) => JSON.stringify(entry).includes(marker))
      },
      { intervals: [250, 500, 1_000, 2_000], timeout: 15_000 },
    )
    .toHaveLength(3)

  const journalEntries = (await e2eFixtureDiagnosticsRead(runId)).filter((entry) =>
    JSON.stringify(entry).includes(marker),
  )
  expect(journalEntries.every((entry) => entry.eventType === "client-log")).toBe(true)
  expect(journalEntries.every((entry) => entry.userId === userId)).toBe(true)
  expect(journalEntries.map((entry) => entry.source)).toEqual(expect.arrayContaining(["console.error", "fetch"]))

  const serializedJournal = JSON.stringify(journalEntries)
  expect(serializedJournal).toContain(failedPath)
  expect(serializedJournal).toContain("[REDACTED]")
  expect(serializedJournal).not.toContain(secret)
  expect(serializedJournal).not.toContain("diagnostic-fragment")
  expect(serializedJournal).not.toContain(`?token=`)
}
