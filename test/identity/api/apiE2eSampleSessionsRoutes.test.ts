import { afterAll, beforeAll, expect, test } from "bun:test"
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { agentTable } from "../../../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../../../src/api/appEnvironment.js"
import type { DatabaseConnection } from "../../../src/database/databaseClient.js"
import { databaseConnectionCreate } from "../../../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../../../src/database/databaseMigrate.js"
import { exampleDataFixture } from "../../../src/database/exampleDataFixture.js"
import { apiE2eFixtureRoutesAdd } from "../../../src/identity/api/apiE2eFixtureRoutesAdd.js"
import { applicationUserTable } from "../../../src/identity/db/applicationUserTable.js"
import { e2eSampleSessionsTable } from "../../../src/identity/db/e2eSampleSessionsTable.js"
import { organizationTable } from "../../../src/identity/db/organizationTable.js"
import { messageTable } from "../../../src/message/db/messageTable.js"
import { projectTable } from "../../../src/project/db/projectTable.js"
import { projectResolve } from "../../../src/project/actions/projectResolve.js"
import { projectTextRead } from "../../../src/project/actions/projectTextRead.js"
import { runDelegationTable } from "../../../src/run/db/runDelegationTable.js"
import { runFinalizedDetailTable } from "../../../src/run/db/runFinalizedDetailTable.js"
import { runTable } from "../../../src/run/db/runTable.js"
import { serverTable } from "../../../src/servers/db/serverTable.js"
import { sessionHistoryEntryTable } from "../../../src/session/db/sessionHistoryEntryTable.js"
import { sessionTable } from "../../../src/session/db/sessionTable.js"
import { sessionViewTable } from "../../../src/session/db/sessionViewTable.js"

const secret = "s".repeat(48)
const config = {
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "test" as const,
  oidcIssuer: "https://fixtures.example.test/",
  oidcOrganizationId: "fixture-org",
}
let directory: string
let connection: DatabaseConnection
let app: Hono<AppEnvironment>
const request = (method: string, endpoint: string, body?: unknown, authorization = `Bearer ${secret}`) =>
  app.request(`https://preview.codeline.work/api/_e2e/fixtures${endpoint}`, {
    method,
    headers: { Authorization: authorization },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "codeline-sample-fixtures."))
  const filePath = path.join(directory, "db.sqlite")
  expect((await databaseMigrate(filePath)).success).toBe(true)
  connection = databaseConnectionCreate(filePath)
  await connection.db
    .insert(organizationTable)
    .values({ id: "fixture-organization", externalId: "fixture-org", name: "Fixtures" })
  const server = exampleDataFixture.servers[0]!
  const agent = exampleDataFixture.agents[0]!
  const sample = exampleDataFixture.sessions[0]!
  await connection.db
    .insert(applicationUserTable)
    .values({ id: exampleDataFixture.user.id, displayName: exampleDataFixture.user.displayName })
  await connection.db
    .insert(serverTable)
    .values({ id: server.id, organizationId: "fixture-organization", name: server.name, endpoint: server.endpoint })
  await connection.db.insert(agentTable).values({
    id: agent.id,
    serverId: server.id,
    name: agent.name,
    role: agent.role,
    configuration: agent.configuration,
  })
  await connection.db.insert(projectTable).values({
    id: exampleDataFixture.projects[0]!.id,
    userId: exampleDataFixture.user.id,
    path: exampleDataFixture.projects[0]!.path,
  })
  await connection.db.insert(sessionTable).values({
    id: sample.id,
    userId: exampleDataFixture.user.id,
    serverId: server.id,
    primaryAgentId: agent.id,
    projectPath: sample.projectPath,
    title: sample.title,
    clientRequestId: sample.clientRequestId,
  })
  app = new Hono<AppEnvironment>()
  apiE2eFixtureRoutesAdd(app, { configuration: config, database: connection.db, token: secret })
})
afterAll(async () => {
  connection?.client.close()
  if (directory !== undefined) await rm(directory, { recursive: true, force: true })
})

test("sample sessions require a verified run and clone the entire example graph once without touching canonical IDs", async () => {
  const endpoint = "/runs/sampleone/sample-sessions"
  expect((await request("POST", endpoint)).status).toBe(409)
  expect((await request("GET", endpoint)).status).toBe(409)
  expect((await request("POST", "/runs", { runId: "sampleone" })).status).toBe(201)
  expect((await request("POST", endpoint, undefined, "Bearer wrong")).status).toBe(401)
  expect((await request("POST", endpoint, { other: true })).status).toBe(400)
  const first = await request("POST", endpoint)
  expect(first.status).toBe(201)
  expect(first.headers.get("Cache-Control")).toBe("no-store")
  const created = (await first.json()) as { createdAt: string; userId: string; mapping: Record<string, string> }
  for (const source of exampleDataFixture.projects) {
    const target = created.mapping[`path:${source.path}`]!
    expect(target).toBe(path.join(source.path, ".e2e-sampleone"))
    expect((await lstat(target)).isDirectory()).toBe(true)
    expect(await readFile(path.join(target, "README.md"), "utf8")).toBe(
      await readFile(path.join(source.path, "README.md"), "utf8"),
    )
    const projectId = created.mapping[`project:${source.id}`]!
    const resolved = await projectResolve([path.dirname(source.path)], projectId, {
      database: connection.db,
      userId: created.userId,
    })
    expect(resolved.success).toBe(true)
    if (resolved.success) {
      expect(resolved.data.rootDir).toBe(target)
      expect((await projectTextRead(resolved.data.rootDir, "README.md")).success).toBe(true)
    }
  }
  expect(created.mapping[`session:${exampleDataFixture.sessions[0]!.id}`]).not.toBe(exampleDataFixture.sessions[0]!.id)
  const retry = await request("POST", endpoint)
  expect(retry.status).toBe(200)
  expect(await retry.json()).toEqual({ ...created, exists: true })
  expect(await (await request("GET", endpoint)).json()).toEqual({ ...created, exists: true })
  expect(await connection.db.select().from(sessionTable).where(eq(sessionTable.userId, created.userId))).toHaveLength(
    exampleDataFixture.sessions.length,
  )
  expect(await connection.db.select().from(runTable).where(eq(runTable.userId, created.userId))).toHaveLength(
    exampleDataFixture.runs.length,
  )
  expect(
    await connection.db.select().from(runDelegationTable).where(eq(runDelegationTable.userId, created.userId)),
  ).toHaveLength(exampleDataFixture.delegations.length)
  expect(
    await connection.db
      .select()
      .from(runFinalizedDetailTable)
      .where(eq(runFinalizedDetailTable.userId, created.userId)),
  ).toHaveLength(exampleDataFixture.runs.length)
  expect(
    await connection.db.select().from(sessionTable).where(eq(sessionTable.id, exampleDataFixture.sessions[0]!.id)),
  ).toHaveLength(1)
  expect(
    await connection.db.select().from(serverTable).where(eq(serverTable.id, exampleDataFixture.servers[0]!.id)),
  ).toHaveLength(1)
  const child = (
    await connection.db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.id, created.mapping["session:example-session-active-2"]!))
  )[0]!
  expect(child.parentSessionId).toBe(created.mapping["session:example-session-active-1"]!)
  expect(child.projectPath).toBe(created.mapping[`path:${exampleDataFixture.sessions[1]!.projectPath}`]!)
  const project = (
    await connection.db
      .select()
      .from(projectTable)
      .where(eq(projectTable.id, created.mapping[`project:${exampleDataFixture.projects[0]!.id}`]!))
  )[0]!
  expect(project.parentFolderId).toBe(created.mapping["folder:adaptive"]!)
  const delegation = (await connection.db.select().from(runDelegationTable))[0]!
  expect(delegation.childRunId).toBe(created.mapping["run:example-run-child-1"]!)
  const details = await connection.db.select().from(runFinalizedDetailTable)
  expect(details.some((row) => row.tools.length > 0)).toBe(true)
  const childDetail = details.find((row) => row.runId === created.mapping["run:example-run-child-1"])
  expect(childDetail?.transcript.assistantText).toBe("The delegated example task is complete.")
  expect((await connection.db.select().from(sessionHistoryEntryTable)).length).toBeGreaterThan(
    exampleDataFixture.sessions.length,
  )
  expect((await request("DELETE", "/runs/sampleone")).status).toBe(200)
  expect((await request("DELETE", "/runs/sampleone")).status).toBe(200)
  for (const source of exampleDataFixture.projects) {
    expect(
      await lstat(created.mapping[`path:${source.path}`]!).then(
        () => true,
        () => false,
      ),
    ).toBe(false)
    expect((await lstat(source.path)).isDirectory()).toBe(true)
  }
  expect(await connection.db.select().from(e2eSampleSessionsTable)).toEqual([])
  expect((await connection.db.select().from(serverTable)).map((row) => row.id)).toEqual([
    exampleDataFixture.servers[0]!.id,
  ])
  expect((await connection.db.select().from(projectTable)).map((row) => row.id)).toEqual([
    exampleDataFixture.projects[0]!.id,
  ])
  expect((await connection.db.select().from(sessionTable)).map((row) => row.id)).toEqual([
    exampleDataFixture.sessions[0]!.id,
  ])
  expect(await connection.db.select().from(messageTable)).toEqual([])
})

test("additional first-member views of mapped sessions allow sample status and purge, but seeded views remain required", async () => {
  const runId = "sampleviewsowned"
  expect((await request("POST", "/runs", { runId })).status).toBe(201)
  const issued = await request("POST", `/runs/${runId}/sample-sessions`)
  expect(issued.status).toBe(201)
  const { mapping, userId } = (await issued.json()) as { mapping: Record<string, string>; userId: string }
  const seededSessionIds = new Set(exampleDataFixture.sessionViews.map((view) => mapping[`session:${view.sessionId}`]!))
  const extraSession = exampleDataFixture.sessions.find(
    (session) => !seededSessionIds.has(mapping[`session:${session.id}`]!),
  )
  expect(extraSession).toBeDefined()
  const extraSessionId = mapping[`session:${extraSession!.id}`]!
  await connection.db.insert(sessionViewTable).values({
    userId,
    sessionId: extraSessionId,
    acknowledgedFinishedAt: new Date(),
  })
  expect((await request("GET", `/runs/${runId}/sample-sessions`)).status).toBe(200)
  expect((await request("GET", `/runs/${runId}`)).status).toBe(200)

  const seededSessionId = mapping[`session:${exampleDataFixture.sessionViews[0]!.sessionId}`]!
  const [seeded] = await connection.db
    .select()
    .from(sessionViewTable)
    .where(eq(sessionViewTable.sessionId, seededSessionId))
  expect(seeded).toBeDefined()
  await connection.db.delete(sessionViewTable).where(eq(sessionViewTable.sessionId, seededSessionId))
  expect((await request("GET", `/runs/${runId}/sample-sessions`)).status).toBe(409)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  await connection.db.insert(sessionViewTable).values(seeded!)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect(
    await connection.db.select().from(sessionViewTable).where(eq(sessionViewTable.sessionId, extraSessionId)),
  ).toEqual([])
})

test("a foreign-owner view on a mapped session blocks sample status and purge", async () => {
  const runId = "sampleviewsforeign"
  expect((await request("POST", "/runs", { runId })).status).toBe(201)
  const issued = await request("POST", `/runs/${runId}/sample-sessions`)
  expect(issued.status).toBe(201)
  const { mapping, userId } = (await issued.json()) as { mapping: Record<string, string>; userId: string }
  const sessionId = mapping[`session:${exampleDataFixture.sessions[0]!.id}`]!
  // Deliberately simulate a corrupted graph: the composite owner/session FK normally prevents this row.
  await connection.client.execute("PRAGMA foreign_keys = OFF")
  try {
    await connection.db.insert(sessionViewTable).values({
      userId: exampleDataFixture.user.id,
      sessionId,
      acknowledgedFinishedAt: new Date(),
    })
  } finally {
    await connection.client.execute("PRAGMA foreign_keys = ON")
  }
  expect((await request("GET", `/runs/${runId}/sample-sessions`)).status).toBe(409)
  expect((await request("GET", `/runs/${runId}`)).status).toBe(409)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  expect(
    await connection.db.select().from(sessionViewTable).where(eq(sessionViewTable.sessionId, sessionId)),
  ).toContainEqual(expect.objectContaining({ userId: exampleDataFixture.user.id }))
  await connection.db.delete(sessionViewTable).where(eq(sessionViewTable.userId, exampleDataFixture.user.id))
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect(await connection.db.select().from(sessionViewTable).where(eq(sessionViewTable.userId, userId))).toEqual([])
})

test("preexisting clone paths are not adopted or removed when sample issuance fails", async () => {
  const source = exampleDataFixture.projects[1]!.path
  const occupied = path.join(source, ".e2e-pathoccupiedtwo")
  await symlink(exampleDataFixture.projects[0]!.path, occupied)
  try {
    expect((await request("POST", "/runs", { runId: "pathoccupiedtwo" })).status).toBe(201)
    expect((await request("POST", "/runs/pathoccupiedtwo/sample-sessions")).status).toBe(409)
    expect((await lstat(occupied)).isSymbolicLink()).toBe(true)
    expect(
      await lstat(path.join(exampleDataFixture.projects[0]!.path, ".e2e-pathoccupiedtwo")).then(
        () => true,
        () => false,
      ),
    ).toBe(false)
    expect((await request("DELETE", "/runs/pathoccupiedtwo")).status).toBe(200)
  } finally {
    await rm(occupied, { force: true })
  }
})

test("unexpected entries in a clone block status and purge instead of deleting foreign files", async () => {
  expect((await request("POST", "/runs", { runId: "pathforeign" })).status).toBe(201)
  const issued = await request("POST", "/runs/pathforeign/sample-sessions")
  expect(issued.status).toBe(201)
  const { mapping } = (await issued.json()) as { mapping: Record<string, string> }
  const directory = mapping[`path:${exampleDataFixture.projects[0]!.path}`]!
  const foreign = path.join(directory, "foreign.txt")
  await writeFile(foreign, "not a fixture file")
  try {
    expect((await request("GET", "/runs/pathforeign/sample-sessions")).status).toBe(409)
    expect((await request("DELETE", "/runs/pathforeign")).status).toBe(409)
    expect(await readFile(foreign, "utf8")).toBe("not a fixture file")
  } finally {
    await rm(foreign)
  }
  expect((await request("DELETE", "/runs/pathforeign")).status).toBe(200)
  expect(
    await lstat(directory).then(
      () => true,
      () => false,
    ),
  ).toBe(false)
})

test("purge tolerates verified missing run-owned paths but refuses an existing foreign path", async () => {
  const runId = "missingownedpaths"
  expect((await request("POST", "/runs", { runId })).status).toBe(201)
  const issued = await request("POST", `/runs/${runId}/sample-sessions`)
  expect(issued.status).toBe(201)
  const { mapping, userId } = (await issued.json()) as { mapping: Record<string, string>; userId: string }
  const targets = exampleDataFixture.projects.map((project) => mapping[`path:${project.path}`]!)
  await rm(targets[0]!, { recursive: true })
  await rm(targets[2]!, { recursive: true })
  expect((await request("GET", `/runs/${runId}`)).status).toBe(409)
  const projectId = mapping[`project:${exampleDataFixture.projects[0]!.id}`]!
  await connection.db
    .update(projectTable)
    .set({ path: "/unrelated/foreign-project" })
    .where(eq(projectTable.id, projectId))
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  await connection.db.update(projectTable).set({ path: targets[0]! }).where(eq(projectTable.id, projectId))
  const foreign = path.join(targets[1]!, "foreign.txt")
  await writeFile(foreign, "foreign data")
  try {
    expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
    expect(await readFile(foreign, "utf8")).toBe("foreign data")
    expect(await connection.db.select().from(projectTable).where(eq(projectTable.userId, userId))).toHaveLength(
      exampleDataFixture.projects.length,
    )
  } finally {
    await rm(foreign)
  }
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect(await (await request("GET", `/runs/${runId}`)).json()).toEqual({ exists: false })
  expect(await connection.db.select().from(projectTable).where(eq(projectTable.userId, userId))).toEqual([])
  expect(
    await connection.db.select().from(e2eSampleSessionsTable).where(eq(e2eSampleSessionsTable.runId, runId)),
  ).toEqual([])
  for (const target of targets) {
    expect(
      await lstat(target).then(
        () => true,
        () => false,
      ),
    ).toBe(false)
  }
})

test("tampered manifest or ownership blocks sample status, retry, and run purge", async () => {
  expect((await request("POST", "/runs", { runId: "sampletwo" })).status).toBe(201)
  expect((await request("POST", "/runs/sampletwo/sample-sessions")).status).toBe(201)
  const [stored] = await connection.db
    .select()
    .from(e2eSampleSessionsTable)
    .where(eq(e2eSampleSessionsTable.runId, "sampletwo"))
  const mapping = { ...stored!.mapping, "server:example-server-local": "example-server-local" }
  await connection.db
    .update(e2eSampleSessionsTable)
    .set({ mapping })
    .where(eq(e2eSampleSessionsTable.runId, "sampletwo"))
  expect((await request("GET", "/runs/sampletwo/sample-sessions")).status).toBe(409)
  expect((await request("GET", "/runs/sampletwo")).status).toBe(409)
  expect((await request("POST", "/runs/sampletwo/sample-sessions")).status).toBe(409)
  expect((await request("DELETE", "/runs/sampletwo")).status).toBe(409)
  await connection.db
    .update(e2eSampleSessionsTable)
    .set({ mapping: stored!.mapping })
    .where(eq(e2eSampleSessionsTable.runId, "sampletwo"))
  const projectId = stored!.mapping[`project:${exampleDataFixture.projects[0]!.id}`]!
  await connection.db
    .update(projectTable)
    .set({ path: "/unrelated/foreign-project" })
    .where(eq(projectTable.id, projectId))
  expect((await request("GET", "/runs/sampletwo/sample-sessions")).status).toBe(409)
  expect((await request("DELETE", "/runs/sampletwo")).status).toBe(409)
  await connection.db
    .update(projectTable)
    .set({ path: stored!.mapping[`path:${exampleDataFixture.projects[0]!.path}`]! })
    .where(eq(projectTable.id, projectId))
  expect((await request("DELETE", "/runs/sampletwo")).status).toBe(200)
})

test("a foreign agent attached to a sample server blocks purge rather than cascading foreign data", async () => {
  expect((await request("POST", "/runs", { runId: "samplethree" })).status).toBe(201)
  const issued = await request("POST", "/runs/samplethree/sample-sessions")
  expect(issued.status).toBe(201)
  const { mapping } = (await issued.json()) as { mapping: Record<string, string> }
  await connection.db.insert(agentTable).values({
    id: "foreign-agent-sample-test",
    serverId: mapping["server:example-server-local"]!,
    name: "Foreign Agent",
    role: "coding",
  })
  expect((await request("GET", "/runs/samplethree/sample-sessions")).status).toBe(409)
  expect((await request("DELETE", "/runs/samplethree")).status).toBe(409)
  expect(
    await connection.db.select().from(agentTable).where(eq(agentTable.id, "foreign-agent-sample-test")),
  ).toHaveLength(1)
  await connection.db.delete(agentTable).where(eq(agentTable.id, "foreign-agent-sample-test"))
  expect((await request("DELETE", "/runs/samplethree")).status).toBe(200)
})
