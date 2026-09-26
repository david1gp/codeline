import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
const { globalResourceEditorStateCreate } = await import(
  "../../../src/configuration/ui/globalResourceEditorStateCreate.js"
)
const { globalResourceClientCreate } = await import("../../../src/configuration/client/globalResourceClientCreate.js")

test("global editor loads actual source, saves edits and creates and deletes server entries", async () => {
  const files = new Map([["existing", "---\nname: existing\ndescription: Existing\n---\nOriginal"]])
  const requests: string[] = []
  const client = globalResourceClientCreate("skills", async (input, init) => {
    const method = init?.method ?? "GET"
    const path = String(input)
    requests.push(`${method} ${path}`)
    const key = decodeURIComponent(path.slice("/api/global/skills/".length))
    if (method === "GET" && path === "/api/global/skills") return Response.json({ skills: [...files.keys()] })
    if (method === "GET") return Response.json({ name: key, content: files.get(key) })
    if (method === "DELETE") {
      files.delete(key)
      return new Response(null, { status: 204 })
    }
    const body = JSON.parse(init?.body as string) as { name?: string; content: string }
    const name = body.name ?? key
    files.set(name, body.content)
    return Response.json({ name, content: body.content }, { status: method === "POST" ? 201 : 200 })
  })
  const root = createRoot((dispose) => ({ dispose, state: globalResourceEditorStateCreate("skills", client) }))
  try {
    await root.state.listLoad()
    expect(root.state.content()).toContain("Original")
    root.state.contentInput({
      currentTarget: { value: "---\nname: existing\ndescription: Existing\n---\nEdited" },
    } as never)
    await root.state.entrySave()
    expect(files.get("existing")).toContain("Edited")
    root.state.entryNew()
    root.state.nameInput({ currentTarget: { value: "new-skill" } } as never)
    root.state.contentInput({
      currentTarget: { value: "---\nname: new-skill\ndescription: New\n---\nInstructions" },
    } as never)
    await root.state.entrySave()
    expect(root.state.names()).toContain("new-skill")
    await root.state.entryDelete()
    expect(files.has("new-skill")).toBe(false)
    expect(requests).toContain("PUT /api/global/skills/existing")
    expect(requests).toContain("POST /api/global/skills")
    expect(requests).toContain("DELETE /api/global/skills/new-skill")
  } finally {
    root.dispose()
  }
})

test("global editor preserves unsaved source on failed save", async () => {
  const client = globalResourceClientCreate("commands", async () =>
    Response.json({ error: { code: "bad_request", message: "Invalid source" } }, { status: 400 }),
  )
  const root = createRoot((dispose) => ({ dispose, state: globalResourceEditorStateCreate("commands", client) }))
  try {
    root.state.nameInput({ currentTarget: { value: "broken" } } as never)
    root.state.contentInput({ currentTarget: { value: "bad" } } as never)
    await root.state.entrySave()
    expect(root.state.dirty()).toBe(true)
    expect(root.state.content()).toBe("bad")
    expect(root.state.error()).toContain("Invalid source")
  } finally {
    root.dispose()
  }
})

test("global editor ignores stale source responses when another entry is selected", async () => {
  let resolveFirst: ((response: Response) => void) | undefined
  const client = globalResourceClientCreate("skills", async (input) => {
    if (String(input).endsWith("/first"))
      return new Promise<Response>((resolve) => {
        resolveFirst = resolve
      })
    return Response.json({ name: "second", content: "Second source" })
  })
  const root = createRoot((dispose) => ({ dispose, state: globalResourceEditorStateCreate("skills", client) }))
  try {
    const pending = root.state.entrySelect("first")
    await root.state.entrySelect("second")
    resolveFirst?.(Response.json({ name: "first", content: "Stale source" }))
    await pending
    expect(root.state.selected()).toBe("second")
    expect(root.state.content()).toBe("Second source")
  } finally {
    root.dispose()
  }
})
