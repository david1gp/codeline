import { expect, test } from "bun:test"
import { e2eFixtureCleanupCreate } from "../../e2e/e2eFixtureCleanupCreate.js"
import type { E2eCheckpoint } from "../../e2e/e2eCheckpointSchema.js"

const checkpoint: E2eCheckpoint = {
  version: 1,
  target: "production",
  origin: "https://preview.codeline.work",
  runId: "e2eruntest123",
  createdAt: "2026-09-25T12:00:00.000Z",
  completedSuites: [],
  resourceIds: { fixtureRunIds: ["e2efirst123", "e2esecond123"] },
}
const allowedOrigins = { production: checkpoint.origin, dev: "https://dev.example.test" }

test("cleanup checks, deletes, and verifies every registered fixture ID", async () => {
  const calls: string[] = []
  const existing = new Set(["e2efirst123", "e2esecond123"])
  const cleanup = e2eFixtureCleanupCreate("a".repeat(32), allowedOrigins, async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`)
    expect(init?.redirect).toBe("error")
    expect(init?.cache).toBe("no-store")
    expect(init?.headers).toEqual({ Authorization: `Bearer ${"a".repeat(32)}` })
    const id = url.split("/").at(-1)!
    if (init?.method === "DELETE") existing.delete(id)
    return Response.json({ exists: existing.has(id) })
  })
  await cleanup(checkpoint)
  expect(calls).toEqual(checkpoint.resourceIds.fixtureRunIds.flatMap((id) =>
    ["GET", "DELETE", "GET"].map((method) => `${method} ${checkpoint.origin}/api/_e2e/fixtures/runs/${id}`),
  ))
})

test("no-data cleanup makes no requests; an already absent marker is verified without DELETE", async () => {
  const calls: string[] = []
  const cleanup = e2eFixtureCleanupCreate("a".repeat(32), allowedOrigins, async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${url}`)
    return Response.json({ exists: false })
  })
  await cleanup({ ...checkpoint, resourceIds: { fixtureRunIds: [] } })
  expect(calls).toEqual([])
  await cleanup({ ...checkpoint, resourceIds: { fixtureRunIds: ["e2efirst123"] } })
  expect(calls).toEqual(Array(2).fill(`GET ${checkpoint.origin}/api/_e2e/fixtures/runs/e2efirst123`))
})

test("cleanup refuses target mismatch and invalid registered IDs without requests", async () => {
  let requests = 0
  const cleanup = e2eFixtureCleanupCreate("a".repeat(32), allowedOrigins, async () => {
    requests++
    return Response.json({ exists: false })
  })
  await expect(cleanup({ ...checkpoint, origin: "https://other.example.test" })).rejects.toThrow("target mismatch")
  await expect(cleanup({ ...checkpoint, resourceIds: { fixtureRunIds: ["notowned"] } })).rejects.toThrow("Invalid registered")
  await expect(cleanup({ ...checkpoint, resourceIds: { fixtureRunIds: ["e2efirst123", "e2efirst123"] } })).rejects.toThrow("Invalid registered")
  expect(requests).toBe(0)
})

test("one unverified deletion does not prevent attempting the other registered fixture", async () => {
  const calls: string[] = []
  const cleanup = e2eFixtureCleanupCreate("a".repeat(32), allowedOrigins, async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${url.split("/").at(-1)}`)
    if (url.endsWith("e2efirst123")) return Response.json({ exists: true })
    return Response.json({ exists: init?.method !== "DELETE" && calls.length < 5 })
  })
  await expect(cleanup(checkpoint)).rejects.toThrow("cleanup failed for 1 run")
  expect(calls).toEqual([
    "GET e2efirst123", "DELETE e2efirst123", "GET e2esecond123", "DELETE e2esecond123", "GET e2esecond123",
  ])
})
