import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { exampleDataFixture } from "../src/database/exampleDataFixture.js"
import { exampleDataReset } from "../src/database/convex/exampleDataReset.js"
import { exampleDataSeed } from "../src/database/convex/exampleDataSeed.js"
import { providerAgentCatalogConfigurationCompile } from "../src/providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"

type StoredDocument = {
  _creationTime: number
  _id: string
  [key: string]: unknown
}

type MemoryRows = Map<string, StoredDocument[]>

class MemoryQuery {
  private readonly rows: MemoryRows
  private readonly table: string
  private readonly predicates: readonly [string, unknown][]

  constructor(rows: MemoryRows, table: string, predicates: readonly [string, unknown][] = []) {
    this.rows = rows
    this.table = table
    this.predicates = predicates
  }

  withIndex(
    _index: string,
    apply: (builder: { eq: (field: string, value: unknown) => unknown }) => unknown,
  ): MemoryQuery {
    const predicates: [string, unknown][] = [...this.predicates]
    const builder: { eq: (field: string, value: unknown) => unknown } = {
      eq: (field: string, value: unknown) => {
        predicates.push([field, value])
        return builder
      },
    }
    apply(builder)
    return new MemoryQuery(this.rows, this.table, predicates)
  }

  async first(): Promise<StoredDocument | null> {
    return (await this.collect())[0] ?? null
  }

  async collect(): Promise<StoredDocument[]> {
    return (this.rows.get(this.table) ?? []).filter((row) =>
      this.predicates.every(([field, value]) => row[field] === value),
    )
  }
}

function memoryContext() {
  const rows: MemoryRows = new Map()
  let nextId = 1
  const db = {
    query: (table: string) => new MemoryQuery(rows, table),
    insert: async (table: string, value: Record<string, unknown>) => {
      const document = { ...value, _creationTime: nextId, _id: `${table}:${nextId}` } as StoredDocument
      nextId += 1
      rows.set(table, [...(rows.get(table) ?? []), document])
      return document._id
    },
    patch: async (table: string, id: string, value: Record<string, unknown>) => {
      const tableRows = rows.get(table) ?? []
      const index = tableRows.findIndex((row) => row._id === id)
      if (index < 0) throw new Error(`Missing ${table}/${id}`)
      const existing = tableRows[index]
      if (existing === undefined) throw new Error(`Missing ${table}/${id}`)
      tableRows[index] = { ...existing, ...value }
    },
    replace: async (table: string, id: string, value: Record<string, unknown>) => {
      const tableRows = rows.get(table) ?? []
      const index = tableRows.findIndex((row) => row._id === id)
      if (index < 0) throw new Error(`Missing ${table}/${id}`)
      const existing = tableRows[index]
      if (existing === undefined) throw new Error(`Missing ${table}/${id}`)
      tableRows[index] = { ...value, _creationTime: existing._creationTime, _id: id } as StoredDocument
    },
    delete: async (table: string, id: string) => {
      rows.set(
        table,
        (rows.get(table) ?? []).filter((row) => row._id !== id),
      )
    },
  }
  return { context: { db } as any, db, rows }
}

function stableRows(rows: MemoryRows, table: string): StoredDocument[] {
  return [...(rows.get(table) ?? [])].sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

const catalogResult = await providerAgentCatalogLoad(resolve(import.meta.dir, ".."))
if (!catalogResult.success) throw new Error(catalogResult.errorMessage)
const catalogConfigurationsResult = providerAgentCatalogConfigurationCompile(catalogResult.data)
if (!catalogConfigurationsResult.success) throw new Error(catalogConfigurationsResult.errorMessage)
const catalogConfigurations = catalogConfigurationsResult.data.map(({ agent, configuration }) => ({
  id: agent.id,
  configuration,
}))

test("Convex example data seed preserves fixture contracts and is rerunnable", async () => {
  const { context, db, rows } = memoryContext()
  const input = {
    catalogConfigurations,
    organizationExternalId: "seed-test-contentoren-organization",
  }

  const seeded = await exampleDataSeed(context, input)
  expect(seeded).toEqual({
    success: true,
    data: {
      agentCount: exampleDataFixture.agents.length + catalogConfigurations.length,
      catalogAgentCount: catalogConfigurations.length,
      messageCount: 8,
      membershipCount: 1,
      organizationCount: 1,
      serverCount: 2,
      sessionCount: 11,
      userCount: 1,
    },
  })
  if (!seeded.success) return

  expect(await db.query("users").collect()).toHaveLength(1)
  expect(await db.query("externalIdentities").collect()).toHaveLength(1)
  expect(await db.query("organizations").collect()).toHaveLength(1)
  expect(await db.query("organizationMembers").collect()).toHaveLength(1)
  expect(await db.query("servers").collect()).toHaveLength(2)
  expect(await db.query("agents").collect()).toHaveLength(
    exampleDataFixture.agents.length + catalogConfigurations.length,
  )
  expect(await db.query("sessions").collect()).toHaveLength(11)
  expect(await db.query("messages").collect()).toHaveLength(8)

  for (const table of [
    "users",
    "externalIdentities",
    "organizations",
    "organizationMembers",
    "servers",
    "agents",
    "sessions",
    "messages",
  ]) {
    const ids = (await db.query(table).collect()).map((row) => String(row.id ?? row._id))
    expect(new Set(ids).size).toBe(ids.length)
  }

  const servers = await db.query("servers").collect()
  expect(servers.every((server) => server.organizationId === exampleDataFixture.organization.id)).toBe(true)
  expect((await db.query("organizations").collect())[0]).toMatchObject({
    id: exampleDataFixture.organization.id,
    externalId: "seed-test-contentoren-organization",
  })
  expect(await db.query("organizationMembers").collect()).toMatchObject([
    {
      organizationId: exampleDataFixture.organization.id,
      userId: exampleDataFixture.user.id,
      issuer: exampleDataFixture.organizationMembership.issuer,
      subject: exampleDataFixture.organizationMembership.subject,
    },
  ])
  expect(
    (await db.query("externalIdentities").collect()).every(
      (identity) => identity.userId === exampleDataFixture.user.id,
    ),
  ).toBe(true)

  const agents = await db.query("agents").collect()
  const agentIds = new Set(agents.map((agent) => agent.id))
  expect(exampleDataFixture.agents.every((agent) => agentIds.has(agent.id))).toBe(true)
  expect(new Set(agents.map((agent) => agent.serverId)).size).toBe(2)
  expect(
    agents.every((agent) => ["example-server-local", "example-server-remote"].includes(String(agent.serverId))),
  ).toBe(true)
  const catalogAgentRows = agents
    .filter(
      (agent) =>
        agent.configuration !== undefined &&
        typeof agent.configuration === "object" &&
        agent.configuration !== null &&
        "catalogAgent" in agent.configuration,
    )
    .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder))
  expect(catalogAgentRows.map((agent) => agent.id)).toEqual(
    [...catalogConfigurations].sort((left, right) => left.id.localeCompare(right.id)).map(({ id }) => id),
  )
  expect(catalogAgentRows.map((agent) => agent.sortOrder)).toEqual(catalogAgentRows.map((_agent, index) => index))
  expect(agents.every((agent) => agent.parentAgentId === undefined || agentIds.has(agent.parentAgentId))).toBe(true)

  const sessions = await db.query("sessions").collect()
  const sessionIds = new Set(sessions.map((session) => session.id))
  expect(sessions.every((session) => session.userId === exampleDataFixture.user.id)).toBe(true)
  expect(sessions.every((session) => agentIds.has(session.primaryAgentId))).toBe(true)
  expect(
    sessions.every((session) => session.parentSessionId === undefined || sessionIds.has(session.parentSessionId)),
  ).toBe(true)
  expect(sessions.filter((session) => session.archivedAt === undefined)).toHaveLength(10)
  expect(
    sessions.sort((left, right) => Number(left.createdAt) - Number(right.createdAt)).map((session) => session.id),
  ).toEqual(exampleDataFixture.sessions.map((session) => session.id))

  const messages = await db.query("messages").collect()
  expect(messages.every((message) => sessionIds.has(message.sessionId))).toBe(true)
  expect(messages.every((message) => agentIds.has(message.agentId))).toBe(true)
  for (const session of sessions) {
    const sessionMessages = messages
      .filter((message) => message.sessionId === session.id)
      .sort((left, right) => Number(left.sequence) - Number(right.sequence))
    expect(sessionMessages.map((message) => message.sequence)).toEqual(
      sessionMessages.map((_message, index) => index + 1),
    )
  }
  expect(
    stableRows(rows, "messages").find((message) => message.id === "example-message-active-2-assistant")?.content,
  ).toBe("The synchronized message view is available.")

  const firstSnapshot = ["organizations", "servers", "agents", "sessions", "messages"].map((table) => [
    table,
    stableRows(rows, table),
  ])
  const repeated = await exampleDataSeed(context, input)
  expect(repeated).toEqual(seeded)
  expect(
    ["organizations", "servers", "agents", "sessions", "messages"].map((table) => [table, stableRows(rows, table)]),
  ).toEqual(firstSnapshot)

  await db.insert("sessions", {
    id: "seed-test-descendant-session",
    userId: exampleDataFixture.user.id,
    serverId: "example-server-local",
    primaryAgentId: "example-agent-local",
    parentSessionId: "example-session-active-1",
  })
  await db.insert("messages", {
    id: "seed-test-unrelated-message",
    sessionId: "seed-test-descendant-session",
    agentId: "example-agent-local",
    sequence: 1,
  })
  const resetSeed = await exampleDataSeed(context, { ...input, reset: true })
  expect(resetSeed).toEqual(seeded)
  expect((await db.query("messages").collect()).some((message) => message.id === "seed-test-unrelated-message")).toBe(
    true,
  )
  expect(
    (await db.query("sessions").collect()).find((session) => session.id === "seed-test-descendant-session")
      ?.parentSessionId,
  ).toBe("example-session-active-1")

  const resetOnly = await exampleDataReset(context)
  expect(resetOnly).toEqual({ success: true, data: { messageCount: 8 } })
  expect((await db.query("messages").collect()).map((message) => message.id)).toEqual(["seed-test-unrelated-message"])
})

test("Convex example data seed rejects an organization conflict before resetting", async () => {
  const { context, db, rows } = memoryContext()
  const input = {
    catalogConfigurations,
    organizationExternalId: "seed-test-contentoren-organization",
  }
  const seeded = await exampleDataSeed(context, input)
  expect(seeded.success).toBe(true)
  const organization = (await db.query("organizations").collect())[0]
  if (organization === undefined) return
  await db.patch("organizations", organization._id, { externalId: "existing-organization" })
  const before = [...rows.entries()].map(([table, documents]) => [table, [...documents]])

  const conflicting = await exampleDataSeed(context, { ...input, reset: true, organizationExternalId: "other" })
  expect(conflicting.success).toBe(false)
  expect([...rows.entries()].map(([table, documents]) => [table, [...documents]])).toEqual(before)
})
