import { afterAll, beforeAll, expect, test } from "bun:test"
import { lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnvironment } from "../../../src/api/appEnvironment.js"
import type { DatabaseConnection } from "../../../src/database/databaseClient.js"
import { databaseConnectionCreate } from "../../../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../../../src/database/databaseMigrate.js"
import { apiE2eFixtureRoutesAdd } from "../../../src/identity/api/apiE2eFixtureRoutesAdd.js"
import { e2eCommandProjectTable } from "../../../src/identity/db/e2eCommandProjectTable.js"
import { applicationUserTable } from "../../../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../../../src/identity/db/organizationTable.js"
import { e2eFixtureRunTable } from "../../../src/identity/db/e2eFixtureRunTable.js"
import { organizationMemberTable } from "../../../src/identity/db/organizationMemberTable.js"
import { projectTable } from "../../../src/project/db/projectTable.js"
import { serverTable } from "../../../src/servers/db/serverTable.js"
import { sessionTable } from "../../../src/session/db/sessionTable.js"

const token = "c".repeat(48)
const configuration = {
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "test" as const,
  oidcIssuer: "https://fixtures.example.test/",
  oidcOrganizationId: "fixture-org",
}
let directory: string
let root: string
let connection: DatabaseConnection
let app: Hono<AppEnvironment>
const request = (method: string, endpoint: string, authorization = `Bearer ${token}`, body?: string) =>
  app.request(`https://preview.codeline.work/api/_e2e/fixtures${endpoint}`, {
    method,
    headers: { Authorization: authorization },
    ...(body === undefined ? {} : { body }),
  })
const exists = async (target: string) =>
  lstat(target).then(
    () => true,
    () => false,
  )

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "codeline-command-fixture."))
  root = await mkdtemp(path.join(directory, "projects."))
  const filePath = path.join(directory, "db.sqlite")
  expect((await databaseMigrate(filePath)).success).toBe(true)
  connection = databaseConnectionCreate(filePath)
  await connection.db
    .insert(organizationTable)
    .values({ id: "fixture-organization", externalId: "fixture-org", name: "Fixtures" })
  app = new Hono<AppEnvironment>()
  apiE2eFixtureRoutesAdd(app, { configuration, database: connection.db, token, projectRootDirs: [root] })
})

afterAll(async () => {
  connection?.client.close()
  if (directory !== undefined) await rm(directory, { recursive: true, force: true })
})

test("command project requires bearer authorization, a verified run, and an empty request body", async () => {
  expect((await request("GET", "/runs/commandfirst/command-project", "Bearer wrong")).status).toBe(401)
  expect((await request("POST", "/runs/commandfirst/command-project")).status).toBe(409)
  expect((await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId: "commandfirst" }))).status).toBe(
    201,
  )
  expect((await request("POST", "/runs/commandfirst/command-project", `Bearer ${token}`, "{}")).status).toBe(400)
  expect(await exists(path.join(root, ".e2e-command-commandfirst"))).toBe(false)
  expect((await request("DELETE", "/runs/commandfirst")).status).toBe(200)
})

test("command project issues only checked-in command files and README once, persists its path, and run purge asserts absence", async () => {
  const runId = "commandowned"
  expect((await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId }))).status).toBe(201)
  const endpoint = `/runs/${runId}/command-project`
  const response = await request("POST", endpoint)
  expect(response.status).toBe(201)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
  const issued = (await response.json()) as { exists: boolean; path: string; createdAt: string }
  expect(issued).toEqual({
    exists: true,
    path: path.join(root, `.e2e-command-${runId}`),
    createdAt: expect.any(String),
  })
  const [stored] = await connection.db
    .select()
    .from(e2eCommandProjectTable)
    .where(eq(e2eCommandProjectTable.runId, runId))
  expect(stored?.path).toBe(issued.path)
  expect(stored?.createdAt.toISOString()).toBe(issued.createdAt)
  expect((await readdir(issued.path)).sort()).toEqual([".agents", ".e2e-owner", "README.md"].sort())
  expect((await readdir(path.join(issued.path, ".agents/commands"))).sort()).toEqual([
    "delegate-review.md",
    "git",
    "marker.txt",
    "notes.md",
    "review.md",
    "simulate.md",
    "subtask.md",
    "summarize.md",
  ])
  expect(await readFile(path.join(issued.path, ".agents/commands/git/status.md"))).toEqual(
    await readFile(path.join(process.cwd(), ".agents/commands/git/status.md")),
  )
  expect(await readFile(path.join(issued.path, ".e2e-owner"), "utf8")).toBe(
    JSON.stringify({ runId, path: issued.path, createdAt: issued.createdAt }),
  )
  expect((await request("POST", endpoint)).status).toBe(200)
  expect(await (await request("GET", endpoint)).json()).toEqual(issued)
  expect((await request("GET", `/runs/${runId}`)).status).toBe(200)
  expect(await (await request("GET", `/runs/${runId}/diagnostics`)).json()).toEqual({ exists: true, entries: [] })
  expect((await request("GET", "/runs/expired")).status).toBe(200)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect(await exists(issued.path)).toBe(false)
  expect(await exists(root)).toBe(true)
  expect(
    await connection.db.select().from(e2eCommandProjectTable).where(eq(e2eCommandProjectTable.runId, runId)),
  ).toEqual([])
  expect(await (await request("GET", endpoint)).json()).toEqual({ exists: false })
  expect(await (await request("DELETE", `/runs/${runId}`)).json()).toEqual({ exists: false })
})

test("occupied paths are not adopted or deleted and unknown content blocks status and purge", async () => {
  const runId = "commandforeign"
  const target = path.join(root, `.e2e-command-${runId}`)
  await symlink(directory, target)
  try {
    expect((await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId }))).status).toBe(201)
    expect((await request("POST", `/runs/${runId}/command-project`)).status).toBe(409)
    expect((await lstat(target)).isSymbolicLink()).toBe(true)
    expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  } finally {
    await rm(target, { force: true })
  }
  const ownedRun = "commandtamper"
  expect((await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId: ownedRun }))).status).toBe(201)
  const endpoint = `/runs/${ownedRun}/command-project`
  const issued = (await (await request("POST", endpoint)).json()) as { path: string }
  const foreign = path.join(issued.path, "foreign.txt")
  await writeFile(foreign, "foreign")
  expect((await request("GET", endpoint)).status).toBe(409)
  expect((await request("POST", endpoint)).status).toBe(409)
  expect((await request("DELETE", `/runs/${ownedRun}`)).status).toBe(409)
  expect(await readFile(foreign, "utf8")).toBe("foreign")
  await rm(foreign)
  const marker = path.join(issued.path, ".e2e-owner")
  const original = await readFile(marker)
  await writeFile(marker, "other owner")
  expect((await request("DELETE", `/runs/${ownedRun}`)).status).toBe(409)
  expect(await exists(issued.path)).toBe(true)
  await writeFile(marker, original)
  expect((await request("DELETE", `/runs/${ownedRun}`)).status).toBe(200)
})

test("a changed file or substituted symlink blocks purge and an absent owned directory can be purged safely", async () => {
  const runId = "commandmissing"
  expect((await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId }))).status).toBe(201)
  const endpoint = `/runs/${runId}/command-project`
  const issued = (await (await request("POST", endpoint)).json()) as { path: string }
  const review = path.join(issued.path, ".agents/commands/review.md")
  const original = await readFile(review)
  await writeFile(review, "modified")
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  await rm(review)
  await symlink(path.join(process.cwd(), ".agents/commands/review.md"), review)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  await rm(review)
  await writeFile(review, original)
  await rm(issued.path, { recursive: true })
  expect((await request("GET", endpoint)).status).toBe(409)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect(await exists(issued.path)).toBe(false)
})

test("purge finishes a partially removed command project before clearing its ownership marker", async () => {
  const runId = "commandpartial"
  expect((await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId }))).status).toBe(201)
  const issued = (await (await request("POST", `/runs/${runId}/command-project`)).json()) as { path: string }
  await rm(path.join(issued.path, ".agents/commands/review.md"))
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect(await exists(issued.path)).toBe(false)
  expect(
    await connection.db.select().from(e2eCommandProjectTable).where(eq(e2eCommandProjectTable.runId, runId)),
  ).toEqual([])
})

test("a tampered stored path or unmarked E2E-looking user's registration cannot authorize a deletion", async () => {
  const runId = "commandregistry"
  expect((await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId }))).status).toBe(201)
  const endpoint = `/runs/${runId}/command-project`
  const issued = (await (await request("POST", endpoint)).json()) as { path: string }
  await connection.db.update(e2eCommandProjectTable).set({ path: root }).where(eq(e2eCommandProjectTable.runId, runId))
  expect((await request("GET", endpoint)).status).toBe(409)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  expect(await exists(issued.path)).toBe(true)
  expect(await exists(root)).toBe(true)
  await connection.db
    .update(e2eCommandProjectTable)
    .set({ path: issued.path })
    .where(eq(e2eCommandProjectTable.runId, runId))
  await connection.db.insert(applicationUserTable).values({
    id: "foreign-command-user",
    displayName: "E2E Member 1 commandfake",
    email: "e2e-organization-member-commandfake-1@example.test",
  })
  await connection.db
    .insert(projectTable)
    .values({ id: "foreign-command-project", userId: "foreign-command-user", path: issued.path })
  expect((await request("GET", endpoint)).status).toBe(409)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  expect(await exists(issued.path)).toBe(true)
  await connection.db.delete(projectTable).where(eq(projectTable.id, "foreign-command-project"))
  await connection.db.delete(applicationUserTable).where(eq(applicationUserTable.id, "foreign-command-user"))
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect(await exists(issued.path)).toBe(false)
})

test("purge removes exact-path registrations of verified other runs without deleting their sessions or their own projects", async () => {
  const ownerId = "commandcrossowner"
  const otherId = "commandcrossother"
  const owner = (await (
    await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId: ownerId }))
  ).json()) as {
    members: { userId: string }[]
  }
  const other = (await (
    await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId: otherId }))
  ).json()) as {
    members: { userId: string }[]
  }
  const ownedPath = ((await (await request("POST", `/runs/${ownerId}/command-project`)).json()) as { path: string })
    .path
  const otherPath = ((await (await request("POST", `/runs/${otherId}/command-project`)).json()) as { path: string })
    .path
  await connection.db.insert(projectTable).values([
    { id: "cross-owner", userId: owner.members[0]!.userId, path: ownedPath },
    { id: "cross-first", userId: other.members[0]!.userId, path: ownedPath },
    { id: "cross-second", userId: other.members[1]!.userId, path: ownedPath },
    { id: "cross-independent", userId: other.members[0]!.userId, path: otherPath },
  ])
  await connection.db.insert(serverTable).values({
    id: "cross-server",
    organizationId: "fixture-organization",
    name: "Cross-run server",
    endpoint: "https://example.test",
  })
  await connection.db.insert(sessionTable).values({
    id: "cross-session",
    userId: other.members[0]!.userId,
    serverId: "cross-server",
    primaryAgentId: "cross-agent",
    projectPath: ownedPath,
    title: "Other run session",
    clientRequestId: "cross-request",
  })

  expect((await request("GET", `/runs/${ownerId}`)).status).toBe(200)
  expect((await request("GET", `/runs/${ownerId}/command-project`)).status).toBe(200)
  expect((await request("DELETE", `/runs/${ownerId}`)).status).toBe(200)
  expect(await exists(ownedPath)).toBe(false)
  expect(await connection.db.select().from(projectTable).where(eq(projectTable.path, ownedPath))).toEqual([])
  expect(await connection.db.select().from(sessionTable).where(eq(sessionTable.id, "cross-session"))).toHaveLength(1)
  expect(await connection.db.select().from(projectTable).where(eq(projectTable.id, "cross-independent"))).toHaveLength(
    1,
  )
  expect((await request("GET", `/runs/${otherId}`)).status).toBe(200)
  expect((await request("DELETE", `/runs/${ownerId}`)).status).toBe(200)
  expect((await request("DELETE", `/runs/${otherId}`)).status).toBe(200)
  expect(await connection.db.select().from(sessionTable).where(eq(sessionTable.id, "cross-session"))).toEqual([])
  expect(await exists(otherPath)).toBe(false)
  await connection.db.delete(serverTable).where(eq(serverTable.id, "cross-server"))
})

test("a foreign fixture marker or membership mismatch blocks exact-path registration cleanup until verified", async () => {
  const ownerId = "commandverifyowner"
  const otherId = "commandverifyother"
  expect((await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId: ownerId }))).status).toBe(201)
  const other = (await (
    await request("POST", "/runs", `Bearer ${token}`, JSON.stringify({ runId: otherId }))
  ).json()) as {
    members: { userId: string }[]
  }
  const target = ((await (await request("POST", `/runs/${ownerId}/command-project`)).json()) as { path: string }).path
  const userId = other.members[0]!.userId
  await connection.db.insert(projectTable).values({ id: "cross-tampered", userId, path: target })
  const [marker] = await connection.db.select().from(e2eFixtureRunTable).where(eq(e2eFixtureRunTable.runId, otherId))
  expect(marker).toBeDefined()
  await connection.db.delete(e2eFixtureRunTable).where(eq(e2eFixtureRunTable.runId, otherId))
  expect((await request("DELETE", `/runs/${ownerId}`)).status).toBe(409)
  expect(await connection.db.select().from(projectTable).where(eq(projectTable.id, "cross-tampered"))).toHaveLength(1)
  await connection.db.insert(e2eFixtureRunTable).values(marker!)
  await connection.db
    .update(e2eFixtureRunTable)
    .set({ issuer: "https://other.test/" })
    .where(eq(e2eFixtureRunTable.runId, otherId))
  expect((await request("DELETE", `/runs/${ownerId}`)).status).toBe(409)
  expect(await exists(target)).toBe(true)
  expect(await connection.db.select().from(projectTable).where(eq(projectTable.id, "cross-tampered"))).toHaveLength(1)
  await connection.db
    .update(e2eFixtureRunTable)
    .set({ issuer: configuration.oidcIssuer })
    .where(eq(e2eFixtureRunTable.runId, otherId))
  await connection.db
    .update(organizationMemberTable)
    .set({ subject: "wrong-subject" })
    .where(eq(organizationMemberTable.userId, userId))
  expect((await request("GET", `/runs/${ownerId}`)).status).toBe(409)
  expect((await request("DELETE", `/runs/${ownerId}`)).status).toBe(409)
  expect(await connection.db.select().from(projectTable).where(eq(projectTable.id, "cross-tampered"))).toHaveLength(1)
  await connection.db
    .update(organizationMemberTable)
    .set({ subject: `e2e-organization-member-${otherId}-1` })
    .where(eq(organizationMemberTable.userId, userId))
  expect((await request("DELETE", `/runs/${ownerId}`)).status).toBe(200)
  expect((await request("DELETE", `/runs/${otherId}`)).status).toBe(200)
})
