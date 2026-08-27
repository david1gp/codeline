import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResultError } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiCommandRoutesAdd } from "../src/commands/api/apiCommandRoutesAdd.js"
import { commandCatalogInspectionResponseSchema } from "../src/commands/api/commandCatalogInspectionResponseSchema.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"

const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-command-api-"))
const projectRoot = path.join(rootDirectory, "project")
const globalCommandsPath = path.join(rootDirectory, "global", "commands")
const projectCommandsPath = path.join(projectRoot, ".agents", "commands")
let projectId: string
let authorized = true

const app = new Hono<AppEnvironment>()
app.use("*", async (context, next) => {
  if (authorized) context.set("requestIdentity", { userId: "command-api-user" })
  await next()
})
apiProjectRoutesAdd(app, { rootDirs: [rootDirectory] })
apiCommandRoutesAdd(app, { globalCommandsPath, rootDirs: [rootDirectory] })

const failingApp = new Hono<AppEnvironment>()
failingApp.use("*", async (context, next) => {
  context.set("requestIdentity", { userId: "command-api-user" })
  await next()
})
apiProjectRoutesAdd(failingApp, { rootDirs: [rootDirectory] })
apiCommandRoutesAdd(failingApp, {
  commandCatalogDiscover: async () => createResultError("commandCatalogDiscover", "boom"),
  globalCommandsPath,
  rootDirs: [rootDirectory],
})

beforeAll(async () => {
  await fs.mkdir(path.join(projectCommandsPath, "git"), { recursive: true })
  await fs.mkdir(globalCommandsPath, { recursive: true })
  await fs.writeFile(
    path.join(projectCommandsPath, "review.md"),
    [
      "---",
      "description: Review a change",
      "agent: reviewer",
      "model: cliproxyapi/opus",
      "subtask: true",
      "---",
      "Review $1.",
    ].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(projectCommandsPath, "git", "commit.md"),
    ["---", "description: Commit", "---", "Commit $ARGUMENTS"].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(projectCommandsPath, "shared.md"),
    ["---", "description: Project shared", "---", "Project shared."].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(globalCommandsPath, "shared.md"),
    ["---", "description: Global shared", "---", "Global shared."].join("\n"),
    "utf8",
  )
  await fs.writeFile(path.join(projectCommandsPath, "invalid.md"), "no frontmatter", "utf8")

  const list = await app.request("http://codeline.test/project/list")
  expect(list.status).toBe(200)
  const projects = (await list.json()) as { projects: Array<{ id: string; label: string }> }
  const project = projects.projects.find(({ label }) => label === "project")
  if (project === undefined) throw new Error("The command API test project was not discovered.")
  projectId = project.id
})

afterAll(async () => {
  await fs.rm(rootDirectory, { force: true, recursive: true })
})

test("the catalog route returns a typed inspection response for an authorized project", async () => {
  const response = await app.request(`/project/commands/catalog?project=${projectId}`)
  expect(response.status).toBe(200)

  const parsed = v.safeParse(commandCatalogInspectionResponseSchema, await response.json())
  expect(parsed.issues).toBeUndefined()
  expect(parsed.success).toBe(true)
  if (!parsed.success) return

  expect(parsed.output.projectId).toBe(projectId)
  expect(parsed.output.version).toBe(1)
  expect(parsed.output.digest).toMatch(/^sha256-[a-f0-9]{64}$/)
  expect(parsed.output.commands.map(({ name }) => name)).toEqual(["git/commit", "review", "shared"])
  expect(parsed.output.commands.every(({ validation }) => validation === "valid")).toBe(true)
})

test("command frontmatter, template, digest, and relative path are projected for the composer", async () => {
  const response = await app.request(`/project/commands/catalog?project=${projectId}`)
  const parsed = v.parse(commandCatalogInspectionResponseSchema, await response.json())

  const review = parsed.commands.find(({ name }) => name === "review")
  expect(review).toMatchObject({
    agent: "reviewer",
    description: "Review a change",
    model: "cliproxyapi/opus",
    path: ".agents/commands/review.md",
    precedence: 1,
    source: "project",
    subtask: true,
    template: "Review $1.",
  })
  expect(review?.templateDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
})

test("collisions and diagnostics are exposed without leaking absolute filesystem paths", async () => {
  const response = await app.request(`/project/commands/catalog?project=${projectId}`)
  const parsed = v.parse(commandCatalogInspectionResponseSchema, await response.json())

  expect(parsed.collisions.map(({ name }) => name)).toEqual(["shared"])
  expect(parsed.collisions[0]?.winner.source).toBe("project")
  expect(parsed.collisions[0]?.candidates.map(({ path: candidatePath }) => candidatePath)).toEqual([
    ".agents/commands/shared.md",
    "global/commands/shared.md",
  ])

  expect(parsed.diagnostics.some(({ code }) => code === "frontmatter-missing")).toBe(true)
  expect(parsed.diagnostics.every(({ validation }) => validation === "invalid")).toBe(true)

  const paths = [
    ...parsed.commands.map(({ path: value }) => value),
    ...parsed.diagnostics.flatMap(({ path: value, relativePath }) => [value, relativePath]),
    ...parsed.roots.map(({ path: value }) => value),
  ]
  for (const value of paths) {
    expect(value.startsWith("/")).toBe(false)
    expect(value).not.toContain(rootDirectory)
    expect(value.split("/")).not.toContain("..")
  }
  expect(parsed.roots.map(({ source }) => source).sort()).toEqual(["global", "project"])
})

test("the route rejects unauthenticated, invalid, and unknown project requests", async () => {
  authorized = false
  expect((await app.request(`/project/commands/catalog?project=${projectId}`)).status).toBe(401)
  authorized = true

  expect((await app.request("/project/commands/catalog")).status).toBe(400)
  expect((await app.request("/project/commands/catalog?project=")).status).toBe(400)
  expect((await app.request(`/project/commands/catalog?project=${"a".repeat(64)}`)).status).toBe(404)
})

test("a discovery failure is reported as an internal server error", async () => {
  const response = await failingApp.request(`/project/commands/catalog?project=${projectId}`)
  expect(response.status).toBe(500)
  expect(await response.json()).toMatchObject({ error: { code: "internal_server_error" } })
})
