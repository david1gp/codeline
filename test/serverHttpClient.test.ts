import { expect, test } from "bun:test"
import { serverListFetch } from "../src/servers/client/serverListFetch.js"

test("server list client uses the typed HTTP contract", async () => {
  const requests: Request[] = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), "http://localhost"), init)
    requests.push(request)
    return Response.json({
      etag: '"server-etag"',
      revision: 1,
      schemaVersion: "server-list-v1",
      servers: [{ id: "server-1", name: "Primary" }],
    })
  }

  const result = await serverListFetch({ fetch: fetcher, search: "Primary" })
  expect(result.success).toBe(true)
  expect(requests).toHaveLength(1)
  expect(requests[0]?.method).toBe("GET")
  expect(new URL(requests[0]?.url ?? "http://localhost").pathname).toBe("/api/servers")
  expect(new URL(requests[0]?.url ?? "http://localhost").search).toBe("?search=Primary")
  expect(requests[0]?.cache).toBe("no-store")
})
