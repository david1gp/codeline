import { expect, type Page } from "@playwright/test"
import { managedOriginSseRead } from "./managedOriginSseRead.js"

export async function managedOriginPublicFeedAssert(page: Page) {
  await page.goto("/api/health")
  const sse = await managedOriginSseRead(page, "/api/events", { condition: "heartbeat", timeoutMs: 45_000 })
  expect(sse.status, sse.body).toBe(200)
  expect(sse.headers["cache-control"]).toBe("no-cache, no-transform")
  expect(sse.headers["content-type"]).toContain("text/event-stream")
  expect(sse.headers["x-accel-buffering"]).toBe("no")
  expect(sse.body).toContain(": heartbeat")
  expect(sse.elapsedMs).toBeLessThan(45_000)
}
