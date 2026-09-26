import { expect, type BrowserContext } from "@playwright/test"

export async function managedOriginBoundedSnapshotAssert(
  context: BrowserContext,
  baseOrigin: string,
  settledSessionId: string | undefined,
): Promise<string> {
  const snapshot = await context.request.get(`${baseOrigin}/api/sessions/${settledSessionId}/bounded-snapshot`, {
    headers: { "Accept-Encoding": "gzip" },
  })
  expect(snapshot.status()).toBe(200)
  expect(snapshot.headers()["cache-control"]).toBe("private, no-cache")
  expect(snapshot.headers().vary).toBe("Cookie, Accept-Encoding")
  expect(snapshot.headers()["content-encoding"]).toBe("gzip")
  const snapshotBody = (await snapshot.json()) as {
    detailCursor: string
    latestAnswer: { content: string } | null
    semanticSteps: unknown[]
    session: { id: string }
    throughPosition: number
  }
  expect(snapshotBody.session.id).toBe(settledSessionId)
  expect(snapshotBody.detailCursor).toEqual(expect.any(String))
  expect(snapshotBody.throughPosition).toBeGreaterThan(0)
  expect(snapshotBody.semanticSteps.length).toBeGreaterThan(0)
  expect(snapshotBody.latestAnswer?.content).toBe("The workspace shell is ready for local sessions.")
  return snapshotBody.detailCursor
}
