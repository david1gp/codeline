import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { and, asc, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataFixture } from "../src/database/exampleDataFixture.js"
import { exampleDataSeed } from "../src/database/exampleDataSeed.js"
import { openLibsql } from "../src/database/openLibsql.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { externalIdentityTable } from "../src/identity/db/externalIdentityTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { projectFolderTable } from "../src/project/db/projectFolderTable.js"
import { projectTable } from "../src/project/db/projectTable.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runDelegationTable } from "../src/run/db/runDelegationTable.js"
import { runFinalizedDetailTable } from "../src/run/db/runFinalizedDetailTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { sessionHistoryEntryTable } from "../src/session/db/sessionHistoryEntryTable.js"
import { sessionViewTable } from "../src/session/db/sessionViewTable.js"
import { simulationScenarioSessionMetadata } from "../src/simulation/simulationScenarioSessionMetadata.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const temporaryDirectory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "codeline-example-seed-"))
const databaseFilePath = join(temporaryDirectory, "db.sqlite")
const migrationResult = await databaseMigrate(databaseFilePath)
if (!migrationResult.success) throw new Error(migrationResult.errorMessage)
const client = openLibsql(databaseFilePath).$client
const database = drizzle(client, { schema: databaseSchema })
const catalogResult = await providerAgentCatalogLoad(resolve(dirname(fileURLToPath(import.meta.url)), ".."))
if (!catalogResult.success) throw new Error(catalogResult.errorMessage)
const catalogAgentIds = catalogResult.data.agents.map((agent) => agent.id)
const serverIds = exampleDataFixture.servers.map((server) => server.id)
const agentIds = exampleDataFixture.agents.map((agent) => agent.id)
const sessionIds = exampleDataFixture.sessions.map((session) => session.id)
const messageIds = exampleDataFixture.sessions.flatMap((session) => session.messages.map((message) => message.id))
const projectIds = exampleDataFixture.projects.map((project) => project.id)
const runIds = exampleDataFixture.runs.map((run) => run.id)
const attemptIds = exampleDataFixture.attempts.map((attempt) => attempt.id)
const organizationExternalId = "seed-test-contentoren-organization"
const unrelated = {
  agentId: `seed-test-agent-${uuidv7()}`,
  serverId: `seed-test-server-${uuidv7()}`,
  userId: `development:seed-test-${uuidv7()}`,
  sessionId: `seed-test-session-${uuidv7()}`,
  descendantSessionId: `seed-test-descendant-session-${uuidv7()}`,
  messageId: `seed-test-message-${uuidv7()}`,
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values({
    id: unrelated.userId,
    displayName: "Unrelated Seed Test User",
  })
  await database.insert(organizationTable).values({
    id: unrelated.userId,
    externalId: unrelated.userId,
    name: "Unrelated Seed Test Organization",
  })
  await database.insert(serverTable).values({
    id: unrelated.serverId,
    organizationId: unrelated.userId,
    name: "Unrelated Seed Test Server",
    endpoint: "http://unrelated-seed-test.test",
  })
  await database.insert(agentTable).values({
    id: unrelated.agentId,
    serverId: unrelated.serverId,
    name: "Unrelated Seed Test Agent",
    role: "coding",
  })
  await database.insert(sessionTable).values({
    id: unrelated.sessionId,
    userId: unrelated.userId,
    serverId: unrelated.serverId,
    primaryAgentId: unrelated.agentId,
    title: "Unrelated seed test session",
    clientRequestId: `seed-test-request-${uuidv7()}`,
  })
  await database.insert(messageTable).values({
    id: unrelated.messageId,
    sessionId: unrelated.sessionId,
    agentId: unrelated.agentId,
    role: "user",
    sequence: 1,
    content: "Unrelated content must remain.",
    clientRequestId: `seed-test-message-request-${uuidv7()}`,
  })
})

afterAll(async () => {
  await database.delete(sessionTable).where(eq(sessionTable.id, unrelated.descendantSessionId))
  await database.delete(applicationUserTable).where(eq(applicationUserTable.id, unrelated.userId))
  client.close()
  await rm(temporaryDirectory, { recursive: true, force: true })
})

test("the typed fixture has stable counts, IDs, timestamps, and content", () => {
  expect(exampleDataFixture.user.id).toBe("development:local-development")
  expect(exampleDataFixture.organization.id).toBe("contentoren")
  expect(exampleDataFixture.servers.map((server) => server.id)).toEqual([
    "example-server-local",
    "example-server-remote",
  ])
  expect(exampleDataFixture.agents.map((agent) => agent.id)).toEqual([
    "example-agent-local",
    "example-agent-local-review",
    "example-agent-remote",
    ...Object.values(simulationScenarioSessionMetadata).map((scenario) => scenario.agentId),
  ])
  expect(
    exampleDataFixture.agents.every((agent) => exampleDataFixture.servers.some((s) => s.id === agent.serverId)),
  ).toBe(true)
  expect(
    exampleDataFixture.servers.every((server) => server.organizationId === exampleDataFixture.organization.id),
  ).toBe(true)
  expect(exampleDataFixture.agents.every((agent) => agent.configuration.provider === "deterministic")).toBe(true)
  expect(
    exampleDataFixture.agents.find((agent) => agent.id === "example-agent-simulation-compaction-summary"),
  ).toMatchObject({
    configuration: {
      compaction: { enabled: true, maxSummaryTokens: 128, reserveOutputTokens: 512 },
      generation: { maxTokens: 128 },
      model: "simulation-compaction-summary",
      provider: "deterministic",
      tools: { bash: false, webfetch: false },
    },
  })
  expect(catalogAgentIds).toHaveLength(11)
  expect(exampleDataFixture.sessions).toHaveLength(15)
  expect(exampleDataFixture.sessions.filter((session) => session.archivedAt === null)).toHaveLength(14)
  expect(exampleDataFixture.sessions.flatMap((session) => session.messages)).toHaveLength(8)
  expect(exampleDataFixture.sessions[0]?.messages[1]?.content).toBe("The workspace shell is ready for local sessions.")
  expect(exampleDataFixture.tools).toHaveLength(15)
  expect(exampleDataFixture.delegations).toEqual([
    expect.objectContaining({
      childRunId: "example-run-child-1",
      delegationKey: "example-delegation-tool",
      id: "example-delegation-1",
      parentRunId: "example-run-delegating-1",
    }),
  ])
  expect(exampleDataFixture.runs.map((run) => run.outcome)).toEqual([
    "completed",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
    "completed",
    "completed",
  ])
  expect(exampleDataFixture.sessions.slice(0, 4).map((session) => session.parentSessionId)).toEqual([
    null,
    "example-session-active-1",
    "example-session-active-2",
    null,
  ])
  expect(
    exampleDataFixture.sessions.slice(0, 4).map((session) => `${session.serverId}/${session.primaryAgentId}`),
  ).toEqual([
    "example-server-local/example-agent-local",
    "example-server-local/example-agent-local",
    "example-server-local/example-agent-local",
    "example-server-remote/example-agent-remote",
  ])
  expect(exampleDataFixture.sessions.slice(4).map((session) => session.id)).toEqual(
    Object.values(simulationScenarioSessionMetadata).map((scenario) => scenario.sessionId),
  )
  expect(exampleDataFixture.sessions.slice(4).map((session) => session.primaryAgentId)).toEqual(
    Object.values(simulationScenarioSessionMetadata).map((scenario) => scenario.agentId),
  )
  expect(exampleDataFixture.projects.map((project) => project.id)).toEqual([
    "11111111-1111-7111-8111-111111111111",
    "22222222-2222-7222-8222-222222222222",
    "33333333-3333-7333-8333-333333333333",
  ])
  expect(exampleDataFixture.projects.map((project) => project.folderKey)).toEqual(["adaptive", "leo", "personal"])
  expect(exampleDataFixture.projects.every((project) => isAbsolute(project.path))).toBe(true)
  expect(exampleDataFixture.sessions.slice(0, 4).map((session) => session.projectPath)).toEqual(
    exampleDataFixture.projects
      .map((project) => project.path)
      .slice(0, 3)
      .concat(exampleDataFixture.projects.map((project) => project.path).slice(2, 3)),
  )
  expect(exampleDataFixture.runs.map((run) => `${run.sessionId}:${run.status}`)).toEqual([
    "example-session-active-2:succeeded",
    "example-session-active-1:succeeded",
    "example-session-archived-1:failed",
    "example-session-remote-1:aborted",
    "example-session-active-1:aborted",
    "example-session-active-1:succeeded",
    "example-session-active-1:succeeded",
  ])
  expect(exampleDataFixture.sessionViews.map((view) => view.sessionId)).toEqual(["example-session-active-2"])
  expect(exampleDataFixture.sessions.map((session) => session.pinned).slice(0, 4)).toEqual([true, false, true, true])
})

test("development fixture can list and use seeded organization servers", async () => {
  const developmentDatabaseDirectory = await mkdtemp(
    join(process.env.TMPDIR ?? "/tmp", "codeline-development-seed-database-"),
  )
  const developmentDatabaseFilePath = join(developmentDatabaseDirectory, "db.sqlite")
  const migrationResult = await databaseMigrate(developmentDatabaseFilePath)
  if (!migrationResult.success) throw new Error(migrationResult.errorMessage)
  const developmentClient = openLibsql(developmentDatabaseFilePath).$client
  const developmentDatabase = drizzle(developmentClient, { schema: databaseSchema })

  try {
    const seeded = await exampleDataSeed(developmentDatabase, { organizationExternalId })
    expect(seeded.success).toBe(true)

    const developmentApp = appCreate({
      configuration: {
        authMode: "development",
        databaseUrl: `file://${developmentDatabaseFilePath}`,
        developmentIdentity: {
          displayName: exampleDataFixture.user.displayName,
          email: exampleDataFixture.user.email,
          identityKey: exampleDataFixture.organizationMembership.subject,
        },
        nodeEnv: "development",
        oidcOrganizationId: organizationExternalId,
      },
      database: developmentDatabase,
      projectRootDirs: [resolve(dirname(fileURLToPath(import.meta.url)), "..")],
    })
    const developmentServers = await developmentApp.request("/api/servers")
    expect(developmentServers.status).toBe(200)
    expect(await developmentServers.json()).toMatchObject({
      servers: [
        { id: "example-server-local", name: "Example Local Server" },
        { id: "example-server-remote", name: "Example Remote Server" },
      ],
    })
    const developmentAgents = await developmentApp.request("/api/servers/example-server-local/agents")
    expect(developmentAgents.status).toBe(200)
    const developmentAgentsBody = (await developmentAgents.json()) as { agents: Array<{ id: string }> }
    expect(developmentAgentsBody.agents.some((agent) => agent.id === "example-agent-local")).toBe(true)

    const registry = await developmentApp.request("/api/project/registry")
    expect(registry.status).toBe(200)
    const registryBody = (await registry.json()) as {
      folders: Array<{ active: boolean; label: string; unseenEnded: boolean }>
      projects: Array<{
        active: boolean
        available: boolean
        folderId: string | null
        id: string
        label: string
        parentFolder: { id: string; label: string } | null
        unseenEnded: boolean
      }>
    }
    expect(registryBody.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          active: false,
          available: true,
          id: "11111111-1111-7111-8111-111111111111",
          label: "Adaptive example project",
          parentFolder: expect.objectContaining({ label: "adaptive" }),
          unseenEnded: true,
        }),
        expect.objectContaining({
          active: false,
          available: true,
          id: "22222222-2222-7222-8222-222222222222",
          label: "Leo example project",
          parentFolder: expect.objectContaining({ label: "leo" }),
          unseenEnded: true,
        }),
        expect.objectContaining({
          active: false,
          available: true,
          id: "33333333-3333-7333-8333-333333333333",
          label: "Personal example project",
          parentFolder: expect.objectContaining({ label: "personal" }),
          unseenEnded: true,
        }),
      ]),
    )
    expect(registryBody.folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ active: false, label: "adaptive", unseenEnded: true }),
        expect.objectContaining({ active: false, label: "leo", unseenEnded: true }),
        expect.objectContaining({ active: false, label: "personal", unseenEnded: true }),
      ]),
    )
  } finally {
    developmentClient.close()
    await rm(developmentDatabaseDirectory, { force: true, recursive: true })
  }
})

test("rejects an incomplete OIDC fixture identity override", async () => {
  const seeded = await exampleDataSeed(database, {
    organizationExternalId,
    userId: `oidc:incomplete-${uuidv7()}`,
  })

  expect(seeded.success).toBe(false)
})

test("OIDC fixture overrides preserve the configured identity ownership", async () => {
  const userId = `oidc:seed-identity-${uuidv7()}`
  const issuer = `https://issuer.seed-${uuidv7()}.test`
  const subject = `seed-subject-${uuidv7()}`

  try {
    const seeded = await exampleDataSeed(database, {
      organizationExternalId,
      organizationMembershipIssuer: issuer,
      organizationMembershipSubject: subject,
      reset: true,
      userId,
    })
    expect(seeded.success).toBe(true)

    const membership = await database
      .select({ issuer: organizationMemberTable.issuer, subject: organizationMemberTable.subject })
      .from(organizationMemberTable)
      .where(
        and(
          eq(organizationMemberTable.organizationId, exampleDataFixture.organization.id),
          eq(organizationMemberTable.userId, userId),
        ),
      )
    expect(membership).toEqual([{ issuer, subject }])

    const externalIdentity = await database
      .select({ issuer: externalIdentityTable.issuer, subject: externalIdentityTable.subject })
      .from(externalIdentityTable)
      .where(eq(externalIdentityTable.userId, userId))
    expect(externalIdentity).toEqual([{ issuer, subject }])

    const sessions = await database
      .select({ userId: sessionTable.userId })
      .from(sessionTable)
      .where(inArray(sessionTable.id, sessionIds))
    expect(sessions).toHaveLength(exampleDataFixture.sessions.length)
    expect(sessions.every((session) => session.userId === userId)).toBe(true)
  } finally {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
    await exampleDataSeed(database, { organizationExternalId, reset: true })
  }
})

test("rejects a conflicting organization ID without changing seeded rows", async () => {
  const seeded = await exampleDataSeed(database, { organizationExternalId, reset: true })
  expect(seeded.success).toBe(true)
  const conflictingOrganizationExternalId = `seed-test-conflicting-${uuidv7()}`

  await database
    .update(organizationTable)
    .set({ name: "Existing Contentoren Organization" })
    .where(eq(organizationTable.id, exampleDataFixture.organization.id))
  await database
    .update(organizationMemberTable)
    .set({ issuer: "existing-issuer", subject: "existing-subject" })
    .where(
      and(
        eq(organizationMemberTable.organizationId, exampleDataFixture.organization.id),
        eq(organizationMemberTable.userId, exampleDataFixture.user.id),
      ),
    )
  for (const serverId of serverIds) {
    await database
      .update(serverTable)
      .set({
        name: `Existing ${serverId}`,
        endpoint: `http://${serverId}.existing.test`,
        metadata: { fixture: "existing" },
      })
      .where(eq(serverTable.id, serverId))
  }

  const snapshot = async () => ({
    organization: await database
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.id, exampleDataFixture.organization.id)),
    memberships: await database
      .select()
      .from(organizationMemberTable)
      .where(eq(organizationMemberTable.organizationId, exampleDataFixture.organization.id)),
    servers: await database.select().from(serverTable).where(inArray(serverTable.id, serverIds)),
    messages: await database.select().from(messageTable).where(inArray(messageTable.id, messageIds)),
  })
  const before = await snapshot()

  try {
    const conflicting = await exampleDataSeed(database, {
      organizationExternalId: conflictingOrganizationExternalId,
      reset: true,
    })
    expect(conflicting.success).toBe(false)
    if (conflicting.success) return
    expect(conflicting.errorMessage).toContain("conflicts")
    expect(await snapshot()).toEqual(before)
  } finally {
    await database
      .update(organizationTable)
      .set({ externalId: organizationExternalId, name: exampleDataFixture.organization.name })
      .where(eq(organizationTable.id, exampleDataFixture.organization.id))
    await database
      .update(organizationMemberTable)
      .set({
        issuer: exampleDataFixture.organizationMembership.issuer,
        subject: exampleDataFixture.organizationMembership.subject,
      })
      .where(
        and(
          eq(organizationMemberTable.organizationId, exampleDataFixture.organization.id),
          eq(organizationMemberTable.userId, exampleDataFixture.user.id),
        ),
      )
    for (const server of exampleDataFixture.servers) {
      await database
        .update(serverTable)
        .set({ name: server.name, endpoint: server.endpoint, metadata: server.metadata })
        .where(eq(serverTable.id, server.id))
    }
    await exampleDataSeed(database, { organizationExternalId, reset: true })
  }
})

test("reset preserves unrelated data and descendant links", async () => {
  const first = await exampleDataSeed(database, { organizationExternalId })
  expect(first).toEqual({ success: true, data: { sessionCount: 15, messageCount: 8 } })
  const second = await exampleDataSeed(database, { organizationExternalId })
  expect(second).toEqual(first)

  const seededServers = await database
    .select({ id: serverTable.id, name: serverTable.name, organizationId: serverTable.organizationId })
    .from(serverTable)
    .where(inArray(serverTable.id, serverIds))
  expect([...seededServers].sort((left, right) => left.id.localeCompare(right.id))).toEqual(
    exampleDataFixture.servers
      .map((server) => ({ id: server.id, name: server.name, organizationId: exampleDataFixture.organization.id }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  )
  expect(new Set(seededServers.map((server) => server.organizationId))).toEqual(
    new Set([exampleDataFixture.organization.id]),
  )
  const seededOrganization = await database
    .select({ id: organizationTable.id, externalId: organizationTable.externalId, name: organizationTable.name })
    .from(organizationTable)
    .where(eq(organizationTable.id, exampleDataFixture.organization.id))
  expect(seededOrganization).toEqual([
    { id: exampleDataFixture.organization.id, externalId: organizationExternalId, name: "Contentoren" },
  ])
  const seededMembership = await database
    .select({
      organizationId: organizationMemberTable.organizationId,
      userId: organizationMemberTable.userId,
      issuer: organizationMemberTable.issuer,
      subject: organizationMemberTable.subject,
    })
    .from(organizationMemberTable)
    .where(
      and(
        eq(organizationMemberTable.organizationId, exampleDataFixture.organization.id),
        eq(organizationMemberTable.userId, exampleDataFixture.user.id),
      ),
    )
  expect(seededMembership).toEqual([
    {
      organizationId: exampleDataFixture.organization.id,
      userId: exampleDataFixture.user.id,
      issuer: exampleDataFixture.organizationMembership.issuer,
      subject: exampleDataFixture.organizationMembership.subject,
    },
  ])

  const seededAgents = await database
    .select({
      id: agentTable.id,
      name: agentTable.name,
      role: agentTable.role,
      serverId: agentTable.serverId,
      configuration: agentTable.configuration,
    })
    .from(agentTable)
    .where(inArray(agentTable.id, agentIds))
  expect([...seededAgents].sort((left, right) => left.id.localeCompare(right.id))).toEqual(
    exampleDataFixture.agents
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        serverId: agent.serverId,
        configuration: agent.configuration,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  )

  const catalogAgents = await database
    .select({
      id: agentTable.id,
      name: agentTable.name,
      role: agentTable.role,
      parentAgentId: agentTable.parentAgentId,
      configuration: agentTable.configuration,
    })
    .from(agentTable)
    .where(inArray(agentTable.id, catalogAgentIds))
  expect(catalogAgents).toHaveLength(11)
  expect(catalogAgents.map((agent) => agent.id).sort()).toEqual([...catalogAgentIds].sort())
  expect(catalogAgents.find((agent) => agent.id === "delegate")?.parentAgentId).toBeNull()
  expect(catalogAgents.find((agent) => agent.id === "luna-high")?.parentAgentId).toBe("delegate")
  expect(catalogAgents.find((agent) => agent.id === "luna-high")?.configuration).toMatchObject({
    model: "gpt-5.6-luna",
    provider: "codex-lb",
  })

  const sessions = await database.select().from(sessionTable).where(inArray(sessionTable.id, sessionIds))
  const messages = await database.select().from(messageTable).where(inArray(messageTable.id, messageIds))
  const projects = await database.select().from(projectTable).where(inArray(projectTable.id, projectIds))
  const folders = await database
    .select({ bootstrapKey: projectFolderTable.bootstrapKey, id: projectFolderTable.id })
    .from(projectFolderTable)
    .where(eq(projectFolderTable.userId, exampleDataFixture.user.id))
  const runs = await database.select().from(runTable).where(inArray(runTable.id, runIds))
  const attempts = await database.select().from(attemptTable).where(inArray(attemptTable.id, attemptIds))
  const sessionViews = await database
    .select({ acknowledgedFinishedAt: sessionViewTable.acknowledgedFinishedAt, sessionId: sessionViewTable.sessionId })
    .from(sessionViewTable)
    .where(eq(sessionViewTable.userId, exampleDataFixture.user.id))
  expect(projects).toHaveLength(exampleDataFixture.projects.length)
  expect(projects.every((project) => project.parentFolderId !== null)).toBe(true)
  expect(
    projects
      .map((project) => ({ id: project.id, path: project.path }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ).toEqual(
    exampleDataFixture.projects
      .map((project) => ({ id: project.id, path: project.path }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  )
  expect(folders.map((folder) => folder.bootstrapKey).sort()).toEqual(["adaptive", "leo", "personal"])
  expect(
    runs.map((run) => ({ id: run.id, status: run.status })).sort((left, right) => left.id.localeCompare(right.id)),
  ).toEqual(
    exampleDataFixture.runs
      .map((run) => ({ id: run.id, status: run.status }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  )
  expect(
    attempts
      .map((attempt) => ({ id: attempt.id, status: attempt.status }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ).toEqual(
    exampleDataFixture.attempts
      .map((attempt) => ({ id: attempt.id, status: attempt.status }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  )
  expect(sessionViews).toEqual([
    { acknowledgedFinishedAt: new Date("2026-08-12T08:08:00.000Z"), sessionId: "example-session-active-2" },
  ])
  expect(sessions).toHaveLength(15)
  expect(sessions.every((session) => session.userId === exampleDataFixture.user.id)).toBe(true)
  expect(
    [...sessions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((session) => `${session.id}:${session.serverId}/${session.primaryAgentId}`),
  ).toEqual(
    [...exampleDataFixture.sessions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((session) => `${session.id}:${session.serverId}/${session.primaryAgentId}`),
  )
  expect(
    sessions.filter(
      (session) => session.serverId === "example-server-remote" && session.primaryAgentId === "example-agent-remote",
    ),
  ).toHaveLength(1)
  expect(sessions.filter((session) => session.archivedAt === null)).toHaveLength(14)
  expect(sessions.find((session) => session.id === "example-session-active-2")?.parentSessionId).toBe(
    "example-session-active-1",
  )
  expect(sessions.find((session) => session.id === "example-session-active-2")?.projectPath).toBe(
    exampleDataFixture.projects[1]?.path,
  )
  expect(sessions.find((session) => session.id === "example-session-active-2")?.pinned).toBe(false)
  expect(messages).toHaveLength(8)
  expect(messages.find((message) => message.id === "example-message-active-2-assistant")?.content).toBe(
    "The synchronized message view is available.",
  )

  const historyEntries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(inArray(sessionHistoryEntryTable.sessionId, sessionIds))
    .orderBy(asc(sessionHistoryEntryTable.sessionId), asc(sessionHistoryEntryTable.position))
  expect(historyEntries.length).toBeGreaterThan(25)
  expect(new Set(historyEntries.map((entry) => entry.kind))).toEqual(new Set(["message", "run", "tool"]))
  expect(historyEntries.filter((entry) => entry.kind === "message")).toHaveLength(8)
  expect(historyEntries.filter((entry) => entry.kind === "run")).toHaveLength(exampleDataFixture.runs.length)
  expect(historyEntries.filter((entry) => entry.kind === "tool")).toHaveLength(
    exampleDataFixture.tools.length + exampleDataFixture.delegations.length,
  )
  expect(
    historyEntries
      .filter((entry) => entry.kind === "run")
      .map((entry) => (entry.payload as { terminalKind?: string }).terminalKind)
      .sort(),
  ).toEqual(["cancelled", "completed", "completed", "completed", "completed", "failed", "interrupted"].sort())

  const delegationRows = await database
    .select()
    .from(runDelegationTable)
    .where(
      inArray(
        runDelegationTable.id,
        exampleDataFixture.delegations.map((delegation) => delegation.id),
      ),
    )
  expect(delegationRows).toHaveLength(exampleDataFixture.delegations.length)
  expect(delegationRows[0]).toMatchObject({
    childRunId: "example-run-child-1",
    finalizedResult: { status: "succeeded" },
    parentRunId: "example-run-delegating-1",
  })
  const delegationEntry = historyEntries.find(
    (entry) => entry.sourceType === "tool" && entry.sourceDetailId === "example-delegation-tool",
  )
  expect(delegationEntry).toMatchObject({
    payload: {
      childRunId: "example-run-child-1",
      delegationId: "example-delegation-1",
      delegationStatus: "succeeded",
      parentSessionId: "example-session-active-1",
    },
  })

  const finalizedDetails = await database
    .select()
    .from(runFinalizedDetailTable)
    .where(inArray(runFinalizedDetailTable.runId, runIds))
  expect(finalizedDetails).toHaveLength(exampleDataFixture.runs.length)
  expect(finalizedDetails.find((detail) => detail.runId === "example-run-child-1")?.tools).toHaveLength(3)
  expect(finalizedDetails.find((detail) => detail.runId === "example-run-child-1")?.transcript.terminalOutcome).toEqual(
    {
      status: "completed",
    },
  )
  const firstHistorySnapshot = historyEntries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    payload: entry.payload,
    position: entry.position,
    sessionId: entry.sessionId,
    sourceDetailId: entry.sourceDetailId,
    sourceId: entry.sourceId,
    sourceType: entry.sourceType,
  }))
  const firstSnapshot = {
    sessions: [...sessions].sort((left, right) => left.id.localeCompare(right.id)),
    messages: [...messages].sort((left, right) => left.id.localeCompare(right.id)),
  }

  const third = await exampleDataSeed(database, { organizationExternalId })
  expect(third).toEqual(first)
  const secondSnapshot = {
    sessions: (await database.select().from(sessionTable).where(inArray(sessionTable.id, sessionIds))).sort(
      (left, right) => left.id.localeCompare(right.id),
    ),
    messages: (await database.select().from(messageTable).where(inArray(messageTable.id, messageIds))).sort(
      (left, right) => left.id.localeCompare(right.id),
    ),
  }
  expect(secondSnapshot).toEqual(firstSnapshot)
  const secondHistorySnapshot = (
    await database
      .select()
      .from(sessionHistoryEntryTable)
      .where(inArray(sessionHistoryEntryTable.sessionId, sessionIds))
      .orderBy(asc(sessionHistoryEntryTable.sessionId), asc(sessionHistoryEntryTable.position))
  ).map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    payload: entry.payload,
    position: entry.position,
    sessionId: entry.sessionId,
    sourceDetailId: entry.sourceDetailId,
    sourceId: entry.sourceId,
    sourceType: entry.sourceType,
  }))
  expect(secondHistorySnapshot).toEqual(firstHistorySnapshot)

  const unrelatedRows = await database
    .select({ sessionId: sessionTable.id, messageId: messageTable.id })
    .from(sessionTable)
    .innerJoin(messageTable, and(eq(messageTable.sessionId, sessionTable.id), eq(messageTable.id, unrelated.messageId)))
    .where(eq(sessionTable.id, unrelated.sessionId))
  expect(unrelatedRows).toEqual([{ sessionId: unrelated.sessionId, messageId: unrelated.messageId }])

  await database.insert(sessionTable).values({
    id: unrelated.descendantSessionId,
    userId: exampleDataFixture.user.id,
    serverId: "example-server-local",
    primaryAgentId: "example-agent-local",
    parentSessionId: "example-session-active-1",
    title: "User-created fixture descendant",
    clientRequestId: `seed-test-descendant-request-${uuidv7()}`,
  })

  const reset = await exampleDataSeed(database, { organizationExternalId, reset: true })
  expect(reset).toEqual(first)
  const afterReset = await database.select().from(messageTable).where(inArray(messageTable.id, messageIds))
  expect(afterReset).toHaveLength(8)
  const descendantAfterReset = await database
    .select({ parentSessionId: sessionTable.parentSessionId })
    .from(sessionTable)
    .where(eq(sessionTable.id, unrelated.descendantSessionId))
  expect(descendantAfterReset).toEqual([{ parentSessionId: "example-session-active-1" }])
})

test("an explicit empty root configuration preserves the standard fixture seed", async () => {
  const seeded = await exampleDataSeed(database, { organizationExternalId, projectRootDirs: [], reset: true })

  expect(seeded).toEqual({ success: true, data: { sessionCount: 15, messageCount: 8 } })
})

test("configured roots reconcile real children without fixture projects or dependent rows", async () => {
  const rootsDirectory = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "codeline-configured-seed-roots-"))
  const configuredDatabaseDirectory = await mkdtemp(
    join(process.env.TMPDIR ?? "/tmp", "codeline-configured-seed-database-"),
  )
  const configuredDatabaseFilePath = join(configuredDatabaseDirectory, "db.sqlite")
  const migrationResult = await databaseMigrate(configuredDatabaseFilePath)
  if (!migrationResult.success) throw new Error(migrationResult.errorMessage)
  const configuredClient = openLibsql(configuredDatabaseFilePath).$client
  const configuredDatabase = drizzle(configuredClient, { schema: databaseSchema })
  const firstProjectPath = join(rootsDirectory, "first-real-project")
  const secondProjectPath = join(rootsDirectory, "second-real-project")
  const configuredProjectPaths = [firstProjectPath, secondProjectPath].sort()

  try {
    await Promise.all([mkdir(firstProjectPath), mkdir(secondProjectPath)])
    const seeded = await exampleDataSeed(configuredDatabase, {
      organizationExternalId,
      projectRootDirs: [rootsDirectory],
    })
    expect(seeded).toEqual({ success: true, data: { sessionCount: 0, messageCount: 0 } })

    const projects = await configuredDatabase
      .select({ parentFolderId: projectTable.parentFolderId, path: projectTable.path })
      .from(projectTable)
      .where(eq(projectTable.userId, exampleDataFixture.user.id))
    expect(projects.map((project) => project.path).sort()).toEqual(configuredProjectPaths)
    expect(projects.every((project) => project.parentFolderId !== null)).toBe(true)

    const configuredFolders = await configuredDatabase
      .select({ name: projectFolderTable.name })
      .from(projectFolderTable)
      .where(eq(projectFolderTable.userId, exampleDataFixture.user.id))
    expect(configuredFolders.map((folder) => folder.name)).toContain(basename(rootsDirectory))

    expect(
      await configuredDatabase
        .select({ id: projectTable.id })
        .from(projectTable)
        .where(
          inArray(
            projectTable.path,
            exampleDataFixture.projects.map((project) => project.path),
          ),
        ),
    ).toEqual([])
    expect(
      await configuredDatabase
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .where(inArray(sessionTable.id, sessionIds)),
    ).toEqual([])
    expect(
      await configuredDatabase
        .select({ id: messageTable.id })
        .from(messageTable)
        .where(inArray(messageTable.id, messageIds)),
    ).toEqual([])
    expect(
      await configuredDatabase.select({ id: runTable.id }).from(runTable).where(inArray(runTable.id, runIds)),
    ).toEqual([])
    expect(
      await configuredDatabase
        .select({ id: attemptTable.id })
        .from(attemptTable)
        .where(inArray(attemptTable.id, attemptIds)),
    ).toEqual([])
    expect(
      await configuredDatabase
        .select({ sessionId: sessionViewTable.sessionId })
        .from(sessionViewTable)
        .where(inArray(sessionViewTable.sessionId, sessionIds)),
    ).toEqual([])
  } finally {
    configuredClient.close()
    await rm(rootsDirectory, { force: true, recursive: true })
    await rm(configuredDatabaseDirectory, { force: true, recursive: true })
  }
})
