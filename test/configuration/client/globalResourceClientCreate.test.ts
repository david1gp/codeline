import { expect, test } from "bun:test"
import { globalResourceClientCreate } from "../../../src/configuration/client/globalResourceClientCreate.js"

test("global resource client sends authenticated-path CRUD requests with validated responses", async () => {
  const calls: { path: string; method: string; body?: string }[] = []
  const client = globalResourceClientCreate("commands", async (input, init) => {
    const path = String(input)
    const method = init?.method ?? "GET"
    calls.push({ path, method, body: init?.body as string | undefined })
    if (method === "DELETE") return new Response(null, { status: 204 })
    if (path === "/api/global/commands" && method === "GET") return Response.json({ commands: ["team/review"] })
    return Response.json(
      { name: "team/review", content: "---\n---\nReview" },
      { status: method === "POST" ? 201 : 200 },
    )
  })
  expect((await client.list()).success).toBe(true)
  expect((await client.get("team/review")).success).toBe(true)
  expect((await client.create("team/review", "---\n---\nReview")).success).toBe(true)
  expect((await client.update("team/review", "---\n---\nReview")).success).toBe(true)
  expect((await client.delete("team/review")).success).toBe(true)
  expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
    "GET /api/global/commands",
    "GET /api/global/commands/team/review",
    "POST /api/global/commands",
    "PUT /api/global/commands/team/review",
    "DELETE /api/global/commands/team/review",
  ])
  expect(JSON.parse(calls[2]!.body!)).toEqual({ name: "team/review", content: "---\n---\nReview" })
  expect(JSON.parse(calls[3]!.body!)).toEqual({ content: "---\n---\nReview" })
})

test("global resource client reports invalid list payloads and server errors", async () => {
  const invalid = globalResourceClientCreate("skills", async () => Response.json({ skills: [2] }))
  expect((await invalid.list()).success).toBe(false)
  const failed = globalResourceClientCreate("skills", async () =>
    Response.json({ error: { code: "bad_request", message: "Invalid source" } }, { status: 400 }),
  )
  const result = await failed.create("bad", "bad")
  expect(result.success).toBe(false)
  if (!result.success) expect(result.errorMessage).toContain("Invalid source")
})
