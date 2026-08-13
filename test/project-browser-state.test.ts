import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { projectBrowserStateCreate } from "../src/project/projectBrowserStateCreate.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("project browser navigates only through listed directories and returns to their parent", async () => {
  const calls: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: projectBrowserStateCreate({
      fetcher: async (input) => {
        const url = String(input)
        calls.push(url)
        const path = new URL(url, "https://codeline.test").searchParams.get("path")
        return Response.json({
          entries:
            path === "src"
              ? [
                  {
                    name: "index.ts",
                    path: "src/index.ts",
                    type: "file",
                    size: 12,
                    modifiedAt: "2026-08-13T00:00:00.000Z",
                  },
                ]
              : [{ name: "src", path: "src", type: "directory", size: 0, modifiedAt: "2026-08-13T00:00:00.000Z" }],
        })
      },
    }),
  }))

  await tick()
  expect(root.state.currentPath()).toBe("")
  root.state.directoryOpen({
    name: "etc",
    path: "../etc",
    type: "directory",
    size: 0,
    modifiedAt: "2026-08-13T00:00:00.000Z",
  })
  expect(calls).toHaveLength(1)
  root.state.directoryOpen(root.state.entries()[0]!)
  await tick()
  expect(root.state.currentPath()).toBe("src")
  expect(calls[1]).toBe("/api/project/directory?path=src")
  root.state.parentOpen()
  await tick()
  expect(root.state.currentPath()).toBe("")
  expect(calls[2]).toBe("/api/project/directory?path=")
  root.dispose()
})

test("project browser validates bounded previews and keeps an encoded download action on failure", async () => {
  let previewAttempts = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: projectBrowserStateCreate({
      apiBase: "/project",
      fetcher: async (input) => {
        const url = String(input)
        if (url.startsWith("/project/directory")) {
          return Response.json({
            entries: [
              { name: "a b.txt", path: "notes/a b.txt", type: "file", size: 3, modifiedAt: "2026-08-13T00:00:00.000Z" },
            ],
          })
        }
        previewAttempts += 1
        if (previewAttempts === 1) return new Response(null, { status: 400 })
        return Response.json({ path: "notes/a b.txt", kind: "text", mimeType: "text/plain", content: "ok\n", size: 3 })
      },
    }),
  }))

  await tick()
  root.state.fileOpen(root.state.entries()[0]!)
  await tick()
  expect(root.state.previewStatus()).toBe("error")
  expect(root.state.downloadUrl()).toBe("/project/download?path=notes%2Fa%20b.txt")
  root.state.retryPreview()
  await tick()
  expect(root.state.previewStatus()).toBe("complete")
  expect(root.state.preview()).toMatchObject({ kind: "text", content: "ok\n" })
  expect(previewAttempts).toBe(2)
  root.dispose()
})

test("project browser accepts browser-safe image, PDF, and unsupported preview responses", async () => {
  const files = [
    { name: "image.png", path: "image.png", type: "file", size: 4, modifiedAt: "2026-08-13T00:00:00.000Z" },
    { name: "file.pdf", path: "file.pdf", type: "file", size: 4, modifiedAt: "2026-08-13T00:00:00.000Z" },
    { name: "data.bin", path: "data.bin", type: "file", size: 4, modifiedAt: "2026-08-13T00:00:00.000Z" },
  ] as const
  const root = createRoot((dispose) => ({
    dispose,
    state: projectBrowserStateCreate({
      fetcher: async (input) => {
        const url = new URL(String(input), "https://codeline.test")
        if (url.pathname.endsWith("/directory")) return Response.json({ entries: files })
        const path = url.searchParams.get("path")!
        if (path === "image.png") {
          return Response.json({ path, kind: "image", mimeType: "image/png", size: 4, url: "/image-content" })
        }
        if (path === "file.pdf") {
          return Response.json({ path, kind: "pdf", mimeType: "application/pdf", size: 4, url: "/pdf-content" })
        }
        return Response.json({ path, kind: "unsupported", mimeType: "application/octet-stream", size: 4 })
      },
    }),
  }))

  await tick()
  for (const [index, kind] of (["image", "pdf", "unsupported"] as const).entries()) {
    root.state.fileOpen(root.state.entries()[index]!)
    await tick()
    expect(root.state.previewStatus()).toBe("complete")
    expect(root.state.preview()?.kind).toBe(kind)
  }
  root.dispose()
})
