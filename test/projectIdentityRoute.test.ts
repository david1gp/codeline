import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"
import { projectApiIdentityResponseSchema } from "../src/project/api/projectApiIdentityResponseSchema.js"

const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-identity-"))
const projectRoot = path.join(projectsRoot, "identity-project")
const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-identity-outside-"))
const app = new Hono<AppEnvironment>()
apiProjectRoutesAdd(app, { rootDirs: [projectsRoot] })

beforeAll(async () => {
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true })
})

afterAll(async () => {
  await Promise.all([
    fs.rm(projectsRoot, { force: true, recursive: true }),
    fs.rm(otherRoot, { force: true, recursive: true }),
  ])
})

const identityRequest = (query: string) => app.request(`http://codeline.test/project/identity?${query}`)

test("the identity route resolves a project reference to the same stable id the list route publishes", async () => {
  const list = await app.request("http://codeline.test/project/list")
  const listed = (await list.json()) as { projects: Array<{ id: string; label: string }> }
  const expected = listed.projects.find(({ label }) => label === "identity-project")

  const identity = await identityRequest(`path=${encodeURIComponent(projectRoot)}`)
  expect(identity.status).toBe(200)
  const body = await identity.json()
  expect(v.safeParse(projectApiIdentityResponseSchema, body).success).toBe(true)
  expect(body).toEqual({ id: expected?.id, label: "identity-project" })
  expect(body.id).toMatch(/^[a-f0-9]{64}$/)
})

test("the identity route rejects a missing or blank project reference", async () => {
  const missing = await app.request("http://codeline.test/project/identity")
  expect(missing.status).toBe(400)
  const body = await missing.json()
  expect(v.safeParse(apiErrorResponseSchema, body).success).toBe(true)
  expect(body).toEqual({ error: { code: "bad_request", message: "The project reference is invalid." } })

  expect((await identityRequest("path=%20%20")).status).toBe(400)
})

test("the identity route rejects a relative reference and one outside the configured roots", async () => {
  expect((await identityRequest("path=identity-project")).status).toBe(400)

  const outside = await identityRequest(`path=${encodeURIComponent(otherRoot)}`)
  expect(outside.status).toBe(404)
  expect(v.safeParse(apiErrorResponseSchema, await outside.clone().json()).success).toBe(true)

  const descendant = await identityRequest(`path=${encodeURIComponent(path.join(projectRoot, "src"))}`)
  expect(descendant.status).toBe(404)
})

test("the identity route never returns filesystem paths outside the published label", async () => {
  const identity = await identityRequest(`path=${encodeURIComponent(projectRoot)}`)
  const raw = await identity.text()
  expect(raw).not.toContain(projectsRoot)
  expect(raw).not.toContain(os.tmpdir())
})
