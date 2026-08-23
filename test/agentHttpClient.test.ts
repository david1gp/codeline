import { expect, test } from "bun:test"
import { agentDetailFetch } from "../src/agents/client/agentDetailFetch.js"
import { agentListFetch } from "../src/agents/client/agentListFetch.js"

test("agent HTTP clients use the typed list and detail contracts", async () => {
  const requests: Request[] = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), "http://localhost"), init)
    requests.push(request)
    if (request.url.endsWith("/agents/agent-1"))
      return Response.json({
        agent: {
          configuration: { model: "development-default", provider: "deterministic" },
          id: "agent-1",
          name: "Primary",
          role: "coding",
          serverId: "server-1",
        },
        etag: '"agent-etag"',
        revision: 4,
        schemaVersion: "agent-detail-v1",
      })
    return Response.json({
      agents: [{ id: "agent-1", name: "Primary", parentAgentId: null, role: "coding", serverId: "server-1" }],
      etag: '"agents-etag"',
      revision: 3,
      schemaVersion: "agent-list-v1",
    })
  }

  const list = await agentListFetch("server-1", { fetch: fetcher, search: "Primary" })
  const detail = await agentDetailFetch("server-1", "agent-1", { fetch: fetcher })
  expect(list.success).toBe(true)
  expect(detail.success).toBe(true)
  expect(requests).toHaveLength(2)
  expect(new URL(requests[0]?.url ?? "http://localhost").pathname).toBe("/api/servers/server-1/agents")
  expect(new URL(requests[0]?.url ?? "http://localhost").search).toBe("?search=Primary")
  expect(new URL(requests[1]?.url ?? "http://localhost").pathname).toBe("/api/servers/server-1/agents/agent-1")
  expect(requests[0]?.cache).toBe("no-store")
  expect(requests[1]?.cache).toBe("no-store")
})
