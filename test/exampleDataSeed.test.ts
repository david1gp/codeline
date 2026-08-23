import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataFixture } from "../src/database/exampleDataFixture.js"
import { exampleDataSeed } from "../src/database/exampleDataSeed.js"
import { openLibsql } from "../src/database/openLibsql.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
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
  expect(catalogAgentIds).toHaveLength(11)
  expect(exampleDataFixture.sessions).toHaveLength(11)
  expect(exampleDataFixture.sessions.filter((session) => session.archivedAt === null)).toHaveLength(10)
  expect(exampleDataFixture.sessions.flatMap((session) => session.messages)).toHaveLength(8)
  expect(exampleDataFixture.sessions[0]?.messages[1]?.content).toBe("The workspace shell is ready for local sessions.")
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
  expect(exampleDataFixture.sessions.every((session) => session.projectPath === "~")).toBe(true)
  expect(exampleDataFixture.sessions.map((session) => session.pinned).slice(0, 4)).toEqual([true, false, true, true])
})

test("development fixture can list and use seeded organization servers", async () => {
  const seeded = await exampleDataSeed(database, { organizationExternalId })
  expect(seeded.success).toBe(true)

  const developmentApp = appCreate({
    configuration: {
      authMode: "development",
      databaseUrl: `file://${databaseFilePath}`,
      developmentIdentity: {
        displayName: exampleDataFixture.user.displayName,
        email: exampleDataFixture.user.email,
        identityKey: exampleDataFixture.organizationMembership.subject,
      },
      nodeEnv: "development",
      oidcOrganizationId: organizationExternalId,
    },
    database,
    projectRootDirs: [],
  })
  const developmentServers = await developmentApp.request("/api/servers")
  expect(developmentServers.status).toBe(200)
  expect(await developmentServers.json()).toEqual({
    servers: [
      { id: "example-server-local", name: "Example Local Server" },
      { id: "example-server-remote", name: "Example Remote Server" },
    ],
  })
  const developmentAgents = await developmentApp.request("/api/servers/example-server-local/agents")
  expect(developmentAgents.status).toBe(200)
  const developmentAgentsBody = (await developmentAgents.json()) as { agents: Array<{ id: string }> }
  expect(developmentAgentsBody.agents.some((agent) => agent.id === "example-agent-local")).toBe(true)
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
  expect(first).toEqual({ success: true, data: { sessionCount: 11, messageCount: 8 } })
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
  expect(sessions).toHaveLength(11)
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
  expect(sessions.filter((session) => session.archivedAt === null)).toHaveLength(10)
  expect(sessions.find((session) => session.id === "example-session-active-2")?.parentSessionId).toBe(
    "example-session-active-1",
  )
  expect(sessions.find((session) => session.id === "example-session-active-2")?.projectPath).toBe("~")
  expect(sessions.find((session) => session.id === "example-session-active-2")?.pinned).toBe(false)
  expect(messages).toHaveLength(8)
  expect(messages.find((message) => message.id === "example-message-active-2-assistant")?.content).toBe(
    "The synchronized message view is available.",
  )
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
