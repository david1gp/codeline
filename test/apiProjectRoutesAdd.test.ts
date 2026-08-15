import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"
import { projectApiDirectoryConfirmResponseSchema } from "../src/project/api/projectApiDirectoryConfirmResponseSchema.js"
import { projectApiDirectoryResponseSchema } from "../src/project/api/projectApiDirectoryResponseSchema.js"
import { projectApiDirectorySuggestionsResponseSchema } from "../src/project/api/projectApiDirectorySuggestionsResponseSchema.js"
import { projectApiListResponseSchema } from "../src/project/api/projectApiListResponseSchema.js"
import { projectApiMetadataResponseSchema } from "../src/project/api/projectApiMetadataResponseSchema.js"
import { projectApiPreviewResponseSchema } from "../src/project/api/projectApiPreviewResponseSchema.js"
import { projectApiTextResponseSchema } from "../src/project/api/projectApiTextResponseSchema.js"
import { projectDiscoveryEntriesRead } from "../src/project/projectDiscoveryEntriesRead.js"

describe("project HTTP routes", () => {
  let rootDir: string
  let app: Hono<AppEnvironment>

  beforeAll(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-api-test-"))
    await fs.mkdir(path.join(rootDir, "src"))
    await fs.writeFile(path.join(rootDir, "src/example.ts"), "export const example = true\n", "utf8")
    await fs.writeFile(path.join(rootDir, "image.png"), Buffer.from([1, 2, 3, 4]))
    await fs.writeFile(path.join(rootDir, "file.pdf"), Buffer.from("pdf bytes"))

    app = new Hono<AppEnvironment>()
    apiProjectRoutesAdd(app, { rootDir, limits: { maxTextFileSizeBytes: 1024 } })
  })

  afterAll(async () => {
    await fs.rm(rootDir, { force: true, recursive: true })
  })

  test("registers directory, metadata, and text reads independently", async () => {
    const directory = await app.request("http://codeline.test/project/directory?path=src")
    expect(directory.status).toBe(200)
    const directoryBody = await directory.json()
    expect(v.safeParse(projectApiDirectoryResponseSchema, directoryBody).success).toBe(true)
    expect(directoryBody).toMatchObject({ entries: [{ name: "example.ts", path: "src/example.ts", type: "file" }] })

    const metadata = await app.request("http://codeline.test/project/metadata?path=src/example.ts")
    expect(metadata.status).toBe(200)
    expect(v.safeParse(projectApiMetadataResponseSchema, await metadata.json()).success).toBe(true)

    const text = await app.request("http://codeline.test/project/text?path=src/example.ts")
    expect(text.status).toBe(200)
    const textBody = await text.json()
    expect(v.safeParse(projectApiTextResponseSchema, textBody).success).toBe(true)
    expect(textBody.content).toBe("export const example = true\n")
  })

  test("suggests configured directories and confirms a canonical project folder", async () => {
    const suggestions = await app.request("http://codeline.test/project/suggestions?path=s")
    expect(suggestions.status).toBe(200)
    const suggestionsBody = await suggestions.json()
    expect(v.safeParse(projectApiDirectorySuggestionsResponseSchema, suggestionsBody).success).toBe(true)
    expect(suggestionsBody).toEqual({ suggestions: [{ label: "src", path: path.join(rootDir, "src") }] })

    const confirmed = await app.request("http://codeline.test/project/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path.join(rootDir, "src") }),
    })
    expect(confirmed.status).toBe(200)
    const confirmedBody = await confirmed.json()
    expect(v.safeParse(projectApiDirectoryConfirmResponseSchema, confirmedBody).success).toBe(true)
    expect(confirmedBody).toEqual({ project: { label: "src", path: path.join(rootDir, "src") } })

    const outside = await app.request("http://codeline.test/project/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: os.tmpdir() }),
    })
    expect(outside.status).toBe(400)
    expect(JSON.stringify(await outside.json())).not.toContain(rootDir)
  })

  test("marks the legacy single-root list without changing the direct-route contract", async () => {
    const list = await app.request("http://codeline.test/project/list")

    expect(list.status).toBe(200)
    expect(list.headers.get("X-Codeline-Project-Mode")).toBe("legacy-single-root")
    expect(await list.json()).toEqual({ projects: [], truncated: false })

    const directory = await app.request("http://codeline.test/project/directory?path=src")
    expect(directory.status).toBe(200)
  })

  test("downloads a bounded regular file without exposing the root", async () => {
    const response = await app.request("http://codeline.test/project/download?path=src/example.ts")

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="example.ts"')
    expect(response.headers.get("Content-Type")).toContain("application/octet-stream")
    const body = await response.text()
    expect(body).toBe("export const example = true\n")
    expect(body).not.toContain(rootDir)
  })

  test("returns text content and browser-safe image/PDF preview URLs", async () => {
    const text = await app.request("http://codeline.test/project/preview?path=src/example.ts")
    expect(text.status).toBe(200)
    const textBody = await text.json()
    expect(v.safeParse(projectApiPreviewResponseSchema, textBody).success).toBe(true)
    expect(textBody).toMatchObject({
      kind: "text",
      mimeType: "text/typescript",
      content: "export const example = true\n",
    })

    for (const [filePath, kind, mimeType] of [
      ["image.png", "image", "image/png"],
      ["file.pdf", "pdf", "application/pdf"],
    ] as const) {
      const preview = await app.request(`http://codeline.test/project/preview?path=${encodeURIComponent(filePath)}`)
      expect(preview.status).toBe(200)
      const body = await preview.json()
      expect(v.safeParse(projectApiPreviewResponseSchema, body).success).toBe(true)
      expect(body).toMatchObject({
        path: filePath,
        kind,
        mimeType,
        url: `/project/preview/content?path=${encodeURIComponent(filePath)}`,
      })

      const content = await app.request(`http://codeline.test${body.url}`)
      expect(content.status).toBe(200)
      expect(content.headers.get("Content-Type")).toContain(mimeType)
      expect(content.headers.get("Content-Disposition")).toBe(`inline; filename="${path.basename(filePath)}"`)
      expect(new Uint8Array(await content.arrayBuffer())).toEqual(
        new Uint8Array(await fs.readFile(path.join(rootDir, filePath))),
      )
    }
  })

  test("keeps unsupported files as metadata without serving them as previews", async () => {
    await fs.writeFile(path.join(rootDir, "archive.bin"), Buffer.from([0, 1, 2]))
    const response = await app.request("http://codeline.test/project/preview?path=archive.bin")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      path: "archive.bin",
      kind: "unsupported",
      mimeType: "application/octet-stream",
      size: 3,
    })

    const content = await app.request("http://codeline.test/project/preview/content?path=archive.bin")
    expect(content.status).toBe(400)
  })

  test("rejects malformed public paths and hides filesystem details", async () => {
    const invalid = await app.request("http://codeline.test/project/text?path=../secret")
    expect(invalid.status).toBe(400)
    expect(v.safeParse(apiErrorResponseSchema, await invalid.json()).success).toBe(true)

    const missing = await app.request("http://codeline.test/project/text?path=missing.txt")
    expect(missing.status).toBe(404)
    const missingBody = await missing.json()
    expect(v.safeParse(apiErrorResponseSchema, missingBody).success).toBe(true)
    expect(JSON.stringify(missingBody)).not.toContain(rootDir)

    const extraQuery = await app.request("http://codeline.test/project/text?path=src/example.ts&root=/etc")
    expect(extraQuery.status).toBe(400)
  })

  test("lists and scopes configured projects without accepting client root paths", async () => {
    const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-api-roots-test-"))
    const firstProjectRoot = path.join(projectsRoot, "first-project")
    const secondProjectRoot = path.join(projectsRoot, "second-project")
    await Promise.all([fs.mkdir(firstProjectRoot), fs.mkdir(secondProjectRoot)])
    await fs.writeFile(path.join(firstProjectRoot, "README.md"), "first\n", "utf8")
    await fs.writeFile(path.join(secondProjectRoot, "README.md"), "second\n", "utf8")

    try {
      const scopedApp = new Hono<AppEnvironment>()
      apiProjectRoutesAdd(scopedApp, { rootDirs: [projectsRoot] })

      const list = await scopedApp.request("http://codeline.test/project/list")
      expect(list.status).toBe(200)
      const listBody = await list.json()
      expect(v.safeParse(projectApiListResponseSchema, listBody).success).toBe(true)
      expect(listBody.truncated).toBe(false)
      expect(listBody.projects.map((project: { label: string }) => project.label)).toEqual([
        "first-project",
        "second-project",
      ])

      const firstProject = listBody.projects.find((project: { label: string }) => project.label === "first-project")
      expect(firstProject).toBeDefined()
      if (firstProject === undefined) return

      const missingSelection = await scopedApp.request("http://codeline.test/project/text?path=README.md")
      expect(missingSelection.status).toBe(400)

      const pathSelection = await scopedApp.request(
        `http://codeline.test/project/text?project=${encodeURIComponent(firstProjectRoot)}&path=README.md`,
      )
      expect(pathSelection.status).toBe(400)
      expect(JSON.stringify(await pathSelection.json())).not.toContain(projectsRoot)

      const firstText = await scopedApp.request(
        `http://codeline.test/project/text?project=${firstProject.id}&path=README.md`,
      )
      expect(firstText.status).toBe(200)
      expect(await firstText.json()).toMatchObject({ content: "first\n" })

      const unknownProject = await scopedApp.request(
        `http://codeline.test/project/text?project=${"0".repeat(64)}&path=README.md`,
      )
      expect(unknownProject.status).toBe(404)
      expect(JSON.stringify(await unknownProject.json())).not.toContain(projectsRoot)
    } finally {
      await fs.rm(projectsRoot, { force: true, recursive: true })
    }
  })

  test("surfaces only a sanitized truncation flag from project discovery", async () => {
    const scopedApp = new Hono<AppEnvironment>()
    apiProjectRoutesAdd(scopedApp, {
      discoveryEntriesRead: async () => ({ success: true as const, data: { entries: [], truncated: true } }),
      rootDirs: [],
    })

    const list = await scopedApp.request("http://codeline.test/project/list")
    expect(list.status).toBe(200)
    const body = await list.json()
    expect(body).toEqual({ projects: [], truncated: true })
    expect(JSON.stringify(body)).not.toContain("/")
  })

  test("reuses one discovery snapshot for scoped operations and revalidates its directory", async () => {
    const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-api-cache-test-"))
    const projectRoot = path.join(projectsRoot, "cached-project")
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-api-cache-outside-"))
    await fs.mkdir(projectRoot)
    await fs.writeFile(path.join(projectRoot, "README.md"), "cached\n", "utf8")
    await fs.writeFile(path.join(outsideRoot, "README.md"), "outside\n", "utf8")
    let discoveryCalls = 0

    try {
      const scopedApp = new Hono<AppEnvironment>()
      apiProjectRoutesAdd(scopedApp, {
        discoveryEntriesRead: async (rootDirs) => {
          discoveryCalls += 1
          return projectDiscoveryEntriesRead(rootDirs)
        },
        rootDirs: [projectsRoot],
      })

      const list = await scopedApp.request("http://codeline.test/project/list")
      const project = (await list.json()).projects[0] as { id: string }
      const responses = await Promise.all([
        scopedApp.request(`http://codeline.test/project/text?project=${project.id}&path=README.md`),
        scopedApp.request(`http://codeline.test/project/directory?project=${project.id}`),
      ])
      expect(responses.map((response) => response.status)).toEqual([200, 200])
      expect(discoveryCalls).toBe(1)

      await fs.rm(projectRoot, { recursive: true })
      await fs.symlink(outsideRoot, projectRoot)
      const replaced = await scopedApp.request(`http://codeline.test/project/text?project=${project.id}&path=README.md`)
      expect(replaced.status).toBe(404)
      const replacedBody = await replaced.json()
      expect(JSON.stringify(replacedBody)).not.toContain(outsideRoot)
      expect(discoveryCalls).toBe(1)
    } finally {
      await Promise.all([
        fs.rm(projectsRoot, { force: true, recursive: true }),
        fs.rm(outsideRoot, { force: true, recursive: true }),
      ])
    }
  })
})
