import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"
import { providerAgentsClientCreate } from "../../../src/providers/client/providerAgentsClientCreate.js"

mock.module("solid-js", () => solidRuntime)
const { globalSubagentsViewerStateCreate } = await import("../../../src/configuration/ui/globalSubagentsViewerStateCreate.js")

test("global subagent viewer loads authenticated catalog identities instead of browser drafts", async () => {
  const requests: string[] = []
  const client = providerAgentsClientCreate(async (input, init) => {
    requests.push(`${init?.method} ${input}`)
    return Response.json({ agents: [{ id: "explore", enabled: true, mode: "subagent", description: "Explore code" }] })
  })
  const root = createRoot((dispose) => ({ dispose, state: globalSubagentsViewerStateCreate(client) }))
  try {
    await root.state.load()
    expect(requests).toContain("GET /api/providers/agents")
    expect(root.state.agents()).toEqual([{ id: "explore", enabled: true, mode: "subagent", description: "Explore code" }])
    expect(root.state.error()).toBe("")
  } finally { root.dispose() }
})

test("global subagent viewer reports catalog fetch failures without inventing entries", async () => {
  const client = providerAgentsClientCreate(async () => Response.json({ error: { code: "unauthorized", message: "Authentication is required." } }, { status: 401 }))
  const root = createRoot((dispose) => ({ dispose, state: globalSubagentsViewerStateCreate(client) }))
  try {
    await root.state.load()
    expect(root.state.agents()).toEqual([])
    expect(root.state.error()).not.toBe("")
  } finally { root.dispose() }
})
