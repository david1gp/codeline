import { expect, test } from "bun:test"
import { e2eExpiredFixturesCleanupCreate } from "../../e2e/e2eExpiredFixturesCleanupCreate.js"

const origin = "https://preview.codeline.work"
const token = "x".repeat(32)
const allowed = { production: origin, dev: "https://dev.example.test" }

test("server-discovered expired runs are deleted and status-verified even without a checkpoint", async () => {
  const calls: string[] = []
  const existing = new Set(["e2eorphan"])
  const cleanup = e2eExpiredFixturesCleanupCreate(token, allowed, async (url, init) => {
    expect(init?.headers).toEqual({ Authorization: `Bearer ${token}` })
    expect(init?.redirect).toBe("error")
    expect(init?.cache).toBe("no-store")
    calls.push(`${init?.method} ${url}`)
    if (url.endsWith("/expired")) return Response.json({ runIds: [...existing] })
    if (init?.method === "DELETE") existing.delete("e2eorphan")
    return Response.json({ exists: existing.has("e2eorphan") })
  })
  await cleanup("production", origin)
  expect(calls).toEqual([
    `GET ${origin}/api/_e2e/fixtures/runs/expired`,
    `GET ${origin}/api/_e2e/fixtures/runs/e2eorphan`,
    `DELETE ${origin}/api/_e2e/fixtures/runs/e2eorphan`,
    `GET ${origin}/api/_e2e/fixtures/runs/e2eorphan`,
    `GET ${origin}/api/_e2e/fixtures/runs/expired`,
  ])
})

test("expired cleanup refuses mismatched origins and preserves unverified removals", async () => {
  let requests = 0
  const cleanup = e2eExpiredFixturesCleanupCreate(token, allowed, async (url) => {
    requests++
    return Response.json(url.endsWith("/expired") ? { runIds: ["e2eorphan"] } : { exists: true })
  })
  await expect(cleanup("production", "https://other.example.test")).rejects.toThrow("target mismatch")
  expect(requests).toBe(0)
  await expect(cleanup("production", origin)).rejects.toThrow("cleanup failed for 1 run")
  expect(requests).toBe(3)
})
