import { expect, type Page } from "@playwright/test"
import { managedOriginSseRead } from "./managedOriginSseRead.js"

export async function managedOriginSelectedFeedAssert(
  page: Page,
  settledSessionId: string | undefined,
  detailCursor: string,
) {
  // Selected-session detail has its own route and cursor kind. Its replayed
  // entries carry mutable changePosition separately from immutable position.
  const selectedPath = `/api/sessions/${settledSessionId}/events`
  const selectedFrames = await managedOriginSseRead(page, selectedPath, { condition: "frames", minimumFrames: 4 })
  expect(selectedFrames.status).toBe(200)
  expect(selectedFrames.headers["content-type"]).toContain("text/event-stream")
  expect(selectedFrames.frames).toHaveLength(4)
  const selectedChangePositions: number[] = []
  for (const frame of selectedFrames.frames) {
    expect(frame.event).toBe("entry")
    expect(frame.id).toBe(frame.data.id)
    expect(frame.data).toMatchObject({
      changePosition: expect.any(Number),
      entryId: expect.any(String),
      eventType: "entry",
      position: expect.any(Number),
      sessionId: settledSessionId,
    })
    const changePosition = frame.data.changePosition
    const position = frame.data.position
    if (typeof changePosition !== "number" || typeof position !== "number")
      throw new Error("The selected-session frame positions were not numeric.")
    expect(Number.isSafeInteger(changePosition)).toBe(true)
    expect(Number.isSafeInteger(position)).toBe(true)
    expect(changePosition).toBeGreaterThan(0)
    expect(position).toBeGreaterThan(0)
    expect(changePosition).toBeGreaterThanOrEqual(position)
    selectedChangePositions.push(changePosition)
  }
  expect(selectedChangePositions).toEqual([...selectedChangePositions].sort((left, right) => left - right))

  // The cursor returned by the bounded snapshot is sent as `after` on the
  // selected-session stream. The expired-cursor spec covers its reconnect/reset
  // lifecycle without opening a second broad browser flow here.
  const selectedCursorSse = await managedOriginSseRead(
    page,
    `${selectedPath}?after=${encodeURIComponent(detailCursor)}`,
    { condition: "heartbeat", timeoutMs: 45_000 },
  )
  expect(selectedCursorSse.status).toBe(200)
  expect(selectedCursorSse.headers["content-type"]).toContain("text/event-stream")
  expect(selectedCursorSse.body).toContain(": heartbeat")
}
