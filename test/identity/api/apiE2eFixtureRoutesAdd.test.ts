import { createHash } from "node:crypto"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { apiDiagnosticsRoutesAdd } from "../../../src/api/diagnostics/apiDiagnosticsRoutesAdd.js"
import type { AppEnvironment } from "../../../src/api/appEnvironment.js"
import { appCreate } from "../../../src/app/appCreate.js"
import type { DatabaseConnection } from "../../../src/database/databaseClient.js"
import { databaseConnectionCreate } from "../../../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../../../src/database/databaseMigrate.js"
import { applicationUserTable } from "../../../src/identity/db/applicationUserTable.js"
import { e2eFixtureRunTable } from "../../../src/identity/db/e2eFixtureRunTable.js"
import { e2eFixtureDiagnosticTable } from "../../../src/identity/db/e2eFixtureDiagnosticTable.js"
import { e2eSampleSessionsTable } from "../../../src/identity/db/e2eSampleSessionsTable.js"
import { externalIdentityTable } from "../../../src/identity/db/externalIdentityTable.js"
import { identitySessionTable } from "../../../src/identity/db/identitySessionTable.js"
import { organizationMemberTable } from "../../../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../../../src/identity/db/organizationTable.js"
import { apiE2eFixtureRoutesAdd } from "../../../src/identity/api/apiE2eFixtureRoutesAdd.js"
import { journalEventTable } from "../../../src/journal/db/journalEventTable.js"
import { journalReplayBoundaryTable } from "../../../src/journal/db/journalReplayBoundaryTable.js"
import { journalSequenceCounterTable } from "../../../src/journal/db/journalSequenceCounterTable.js"

const secret = "a".repeat(48)
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
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "codeline-e2e-fixtures."))
  const filePath = path.join(directory, "db.sqlite")
  const migrated = await databaseMigrate(filePath)
  expect(migrated.success).toBe(true)
  connection = databaseConnectionCreate(filePath)
  await connection.db
    .insert(organizationTable)
    .values({ id: "fixture-organization", externalId: "fixture-org", name: "Fixtures" })
  app = new Hono<AppEnvironment>()
  apiE2eFixtureRoutesAdd(app, { configuration: config, database: connection.db, token: secret })
})
afterAll(async () => {
  connection?.client.close()
  if (directory !== undefined) await rm(directory, { recursive: true, force: true })
})

test("fixture endpoints are absent without an explicit strong gate and reject cookies or a wrong bearer", async () => {
  const disabled = new Hono<AppEnvironment>()
  apiE2eFixtureRoutesAdd(disabled, { configuration: config, database: connection.db })
  expect(
    (await disabled.request("https://preview.codeline.work/api/_e2e/fixtures/runs", { method: "POST" })).status,
  ).toBe(404)
  expect((await request("POST", "/runs", { runId: "fixtureone" }, "")).status).toBe(401)
  expect((await request("POST", "/runs", { runId: "fixtureone" }, "Bearer wrong")).status).toBe(401)
  expect((await request("POST", "/runs", { runId: "fixtureone" }, "Bearer wrong; Cookie=valid")).status).toBe(401)
  expect((await request("POST", "/runs", { runId: "fixtureone", extra: true })).status).toBe(400)
  expect((await request("POST", "/runs", { runId: "bad_id" })).status).toBe(400)
  const combined = appCreate({ configuration: config, database: connection.db, fixtureApiToken: secret })
  expect(
    (
      await combined.request("https://preview.codeline.work/api/_e2e/fixtures/runs/otherone", {
        headers: { Authorization: `Bearer ${secret}` },
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await combined.request("https://preview.codeline.work/api/_e2e/fixtures/runs/otherone", {
        headers: { Cookie: "__Host-codeline-session=some-session" },
      })
    ).status,
  ).toBe(401)
})

test("issue refuses to adopt an existing same-subject user without a fixture ownership marker", async () => {
  const runId = "preexistingone"
  const subject = `e2e-organization-member-${runId}-1`
  const userId = `oidc:${createHash("sha256").update(`${config.oidcIssuer}\0${subject}`).digest("hex")}`
  await connection.db.insert(applicationUserTable).values({ id: userId, displayName: "Existing shared user" })
  expect((await request("POST", "/runs", { runId })).status).toBe(409)
  expect(
    await connection.db.select().from(applicationUserTable).where(eq(applicationUserTable.id, userId)),
  ).toHaveLength(1)
  expect(await connection.db.select().from(e2eFixtureRunTable).where(eq(e2eFixtureRunTable.runId, runId))).toEqual([])
  await connection.db.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
})

test("run issuance, status, session expiry and verified purge are bounded and idempotent", async () => {
  const issued = await request("POST", "/runs", { runId: "fixtureone" })
  expect(issued.status).toBe(201)
  expect(issued.headers.get("Cache-Control")).toBe("no-store")
  const data = (await issued.json()) as {
    createdAt: string
    members: { token: string; userId: string; expiresAt: string }[]
    subjectPrefix: string
  }
  expect(data.members).toHaveLength(2)
  expect(data.members[0]?.token).toBeTruthy()
  expect(
    data.members.every((member) => Date.parse(member.expiresAt) === Date.parse(data.createdAt) + 24 * 60 * 60 * 1000),
  ).toBe(true)
  expect(data.subjectPrefix).toBe("e2e-organization-member-fixtureone-")
  expect((await request("POST", "/runs", { runId: "fixtureone" })).status).toBe(409)
  const status = await request("GET", "/runs/fixtureone")
  expect(((await status.json()) as { createdAt: string; members?: unknown }).createdAt).toBe(data.createdAt)
  expect(await (await request("GET", "/runs/otherone")).json()).toEqual({ exists: false })

  expect((await request("POST", "/runs/fixtureone/expire")).status).toBe(200)
  const sessions = await connection.db
    .select()
    .from(identitySessionTable)
    .where(
      inArray(
        identitySessionTable.userId,
        data.members.map((member) => member.userId),
      ),
    )
  expect(sessions).toHaveLength(2)
  expect(sessions.every((session) => session.expiresAt.getTime() < Date.now())).toBe(true)
  expect((await request("POST", "/runs/fixtureone/expire")).status).toBe(200)

  expect((await request("DELETE", "/runs/fixtureone")).status).toBe(200)
  expect((await request("DELETE", "/runs/fixtureone")).status).toBe(200)
  expect(await connection.db.select().from(e2eFixtureRunTable)).toEqual([])
  expect(
    await connection.db
      .select()
      .from(applicationUserTable)
      .where(
        inArray(
          applicationUserTable.id,
          data.members.map((member) => member.userId),
        ),
      ),
  ).toEqual([])
  expect(
    await connection.db
      .select()
      .from(identitySessionTable)
      .where(
        inArray(
          identitySessionTable.userId,
          data.members.map((member) => member.userId),
        ),
      ),
  ).toEqual([])
})

test("expiring a selected run member leaves the other session active and refuses foreign users", async () => {
  const runId = "e2eexpiryone"
  const issued = await request("POST", "/runs", { runId })
  expect(issued.status).toBe(201)
  const data = (await issued.json()) as { members: { userId: string }[] }
  const first = data.members[0]!.userId
  const second = data.members[1]!.userId
  expect((await request("POST", `/runs/${runId}/expire`, { userId: "foreign" })).status).toBe(409)
  expect((await request("POST", `/runs/${runId}/expire`, { userId: 123 })).status).toBe(400)
  const expired = await request("POST", `/runs/${runId}/expire`, { userId: first })
  expect(expired.status).toBe(200)
  const body = (await expired.json()) as { expiredSessions: { expiresAt: string; sessionId: string }[] }
  expect(body.expiredSessions).toHaveLength(1)
  expect(Date.parse(body.expiredSessions[0]!.expiresAt)).toBeLessThan(Date.now())
  const sessions = await connection.db
    .select()
    .from(identitySessionTable)
    .where(inArray(identitySessionTable.userId, [first, second]))
  expect(sessions.find((session) => session.userId === first)!.expiresAt.getTime()).toBeLessThan(Date.now())
  expect(sessions.find((session) => session.userId === second)!.expiresAt.getTime()).toBeGreaterThan(Date.now())
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
})

test("journal prune requires a verified run member, preserves sessions and unrelated journals, and advances replay boundaries", async () => {
  const runId = "journalpruneone"
  const issued = await request("POST", "/runs", { runId })
  expect(issued.status).toBe(201)
  const data = (await issued.json()) as { members: { userId: string }[] }
  const first = data.members[0]!.userId
  const second = data.members[1]!.userId
  const foreign = "unrelated-journal-user"
  await connection.db.insert(applicationUserTable).values({ id: foreign, displayName: "Shared Example" })
  const userIds = [first, second, foreign]
  await connection.db.insert(journalSequenceCounterTable).values(userIds.map((userId) => ({ userId, nextSequence: 2 })))
  await connection.db.insert(journalEventTable).values(
    userIds.map((userId) => ({
      id: `event-${userId}`,
      userId,
      sequence: 1,
      eventType: "invalidate",
      payload: { subject: "test" },
      serializedBytes: 80,
    })),
  )

  expect((await request("POST", `/runs/${runId}/prune-journal`, { userId: foreign })).status).toBe(409)
  expect((await request("POST", `/runs/${runId}/prune-journal`, { userId: 123 })).status).toBe(400)
  expect((await request("POST", `/runs/${runId}/prune-journal`, { userId: first }, "Bearer wrong")).status).toBe(401)
  const selected = await request("POST", `/runs/${runId}/prune-journal`, { userId: first })
  expect(selected.status).toBe(200)
  expect(((await selected.json()) as { pruned: unknown[] }).pruned).toEqual([
    { userId: first, prunedEventCount: 1, prunedThroughSequence: 1 },
  ])
  expect(
    await connection.db
      .select()
      .from(journalEventTable)
      .where(inArray(journalEventTable.userId, [second, foreign])),
  ).toHaveLength(2)
  expect(
    await connection.db
      .select()
      .from(identitySessionTable)
      .where(inArray(identitySessionTable.userId, [first, second])),
  ).toHaveLength(2)
  const rest = await request("POST", `/runs/${runId}/prune-journal`)
  expect(rest.status).toBe(200)
  expect(
    ((await rest.json()) as { pruned: { userId: string; prunedEventCount: number; prunedThroughSequence: number }[] })
      .pruned,
  ).toEqual([
    { userId: first, prunedEventCount: 0, prunedThroughSequence: 1 },
    { userId: second, prunedEventCount: 1, prunedThroughSequence: 1 },
  ])
  expect(
    await connection.db.select().from(journalEventTable).where(eq(journalEventTable.userId, foreign)),
  ).toHaveLength(1)
  const boundaries = await connection.db
    .select()
    .from(journalReplayBoundaryTable)
    .where(inArray(journalReplayBoundaryTable.userId, [first, second]))
  expect(boundaries).toHaveLength(2)
  expect(boundaries.map(({ userId, prunedThroughSequence }) => ({ userId, prunedThroughSequence }))).toEqual(
    expect.arrayContaining([
      { userId: first, prunedThroughSequence: 1 },
      { userId: second, prunedThroughSequence: 1 },
    ]),
  )
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  await connection.db.delete(applicationUserTable).where(eq(applicationUserTable.id, foreign))
})

test("journal prune refuses a missing marker or unverifiable member without touching the journal", async () => {
  const runId = "journalprunetwo"
  expect((await request("POST", `/runs/${runId}/prune-journal`)).status).toBe(200)
  expect(await (await request("POST", `/runs/${runId}/prune-journal`)).json()).toEqual({ exists: false })
  const issued = await request("POST", "/runs", { runId })
  const data = (await issued.json()) as { members: { userId: string }[] }
  const userId = data.members[0]!.userId
  await connection.db.insert(journalSequenceCounterTable).values({ userId, nextSequence: 2 })
  await connection.db.insert(journalEventTable).values({
    id: "unverified-journal-event",
    userId,
    sequence: 1,
    eventType: "invalidate",
    payload: {},
    serializedBytes: 30,
  })
  await connection.db
    .update(organizationMemberTable)
    .set({ subject: "changed" })
    .where(eq(organizationMemberTable.userId, userId))
  expect((await request("POST", `/runs/${runId}/prune-journal`, { userId })).status).toBe(409)
  expect(await connection.db.select().from(journalEventTable).where(eq(journalEventTable.userId, userId))).toHaveLength(
    1,
  )
  await connection.db
    .update(organizationMemberTable)
    .set({ subject: `e2e-organization-member-${runId}-1` })
    .where(eq(organizationMemberTable.userId, userId))
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
})

test("a mismatched issuer or membership refuses deletion even with the run marker", async () => {
  const issued = await request("POST", "/runs", { runId: "fixturetwo" })
  expect(issued.status).toBe(201)
  const data = (await issued.json()) as { members: { userId: string }[] }
  const userId = data.members[0]!.userId
  await connection.db
    .update(organizationMemberTable)
    .set({ issuer: "https://other.example.test/" })
    .where(eq(organizationMemberTable.userId, userId))
  expect((await request("DELETE", "/runs/fixturetwo")).status).toBe(409)
  expect((await request("GET", "/runs/fixturetwo")).status).toBe(409)
  expect(
    await connection.db.select().from(applicationUserTable).where(eq(applicationUserTable.id, userId)),
  ).toHaveLength(1)
  await connection.db
    .update(organizationMemberTable)
    .set({ issuer: config.oidcIssuer })
    .where(eq(organizationMemberTable.userId, userId))
  await connection.db
    .update(externalIdentityTable)
    .set({ issuer: "https://other.example.test/" })
    .where(eq(externalIdentityTable.userId, userId))
  expect((await request("DELETE", "/runs/fixturetwo")).status).toBe(409)
  await connection.db
    .update(externalIdentityTable)
    .set({ issuer: config.oidcIssuer })
    .where(eq(externalIdentityTable.userId, userId))
  expect((await request("DELETE", "/runs/fixturetwo")).status).toBe(200)
})

test("purging one run leaves a separately marked run and unrelated organization users untouched", async () => {
  const first = await request("POST", "/runs", { runId: "fixturethree" })
  const second = await request("POST", "/runs", { runId: "fixturefour" })
  expect(first.status).toBe(201)
  expect(second.status).toBe(201)
  const other = (await second.json()) as { members: { userId: string }[] }
  await connection.db
    .insert(applicationUserTable)
    .values({ id: "unrelated-fixture-test-user", displayName: "Shared Example" })
  expect((await request("DELETE", "/runs/fixturethree")).status).toBe(200)
  expect((await request("GET", "/runs/fixturefour")).status).toBe(200)
  expect(
    await connection.db
      .select()
      .from(applicationUserTable)
      .where(
        inArray(
          applicationUserTable.id,
          other.members.map((member) => member.userId),
        ),
      ),
  ).toHaveLength(2)
  expect(
    await connection.db
      .select()
      .from(applicationUserTable)
      .where(eq(applicationUserTable.id, "unrelated-fixture-test-user")),
  ).toHaveLength(1)
  expect((await request("DELETE", "/runs/fixturefour")).status).toBe(200)
  await connection.db.delete(applicationUserTable).where(eq(applicationUserTable.id, "unrelated-fixture-test-user"))
})

test("expired listing includes only verified runs at 24 hours, never recent runs, and requires the fixture bearer", async () => {
  const at = new Date("2026-09-26T12:00:00.000Z")
  const gated = new Hono<AppEnvironment>()
  apiE2eFixtureRoutesAdd(gated, { configuration: config, database: connection.db, token: secret, now: () => at })
  const list = (authorization = `Bearer ${secret}`) =>
    gated.request("https://preview.codeline.work/api/_e2e/fixtures/runs/expired", {
      headers: { Authorization: authorization },
    })
  expect((await list("")).status).toBe(401)
  for (const runId of ["e2eoldone", "e2eboundary", "e2erecent"]) {
    expect((await request("POST", "/runs", { runId })).status).toBe(201)
  }
  await connection.db
    .update(e2eFixtureRunTable)
    .set({ createdAt: new Date(at.getTime() - 24 * 60 * 60 * 1000 - 1) })
    .where(eq(e2eFixtureRunTable.runId, "e2eoldone"))
  await connection.db
    .update(e2eFixtureRunTable)
    .set({ createdAt: new Date(at.getTime() - 24 * 60 * 60 * 1000) })
    .where(eq(e2eFixtureRunTable.runId, "e2eboundary"))
  const listed = await list()
  expect(listed.status).toBe(200)
  expect(listed.headers.get("Cache-Control")).toBe("no-store")
  expect(await listed.json()).toEqual({ runIds: ["e2eoldone", "e2eboundary"] })
  expect((await request("DELETE", "/runs/e2eoldone")).status).toBe(200)
  expect((await request("GET", "/runs/e2eoldone")).json()).resolves.toEqual({ exists: false })
  expect((await request("DELETE", "/runs/e2eboundary")).status).toBe(200)
  expect(await (await list()).json()).toEqual({ runIds: [] })
  expect((await request("GET", "/runs/e2erecent")).status).toBe(200)
  expect((await request("DELETE", "/runs/e2erecent")).status).toBe(200)
})

test("expired listing fails closed on tampered ownership without deleting the marker", async () => {
  const issued = await request("POST", "/runs", { runId: "e2etampered" })
  const data = (await issued.json()) as { members: { userId: string }[] }
  await connection.db
    .update(e2eFixtureRunTable)
    .set({ createdAt: new Date("2020-01-01T00:00:00.000Z") })
    .where(eq(e2eFixtureRunTable.runId, "e2etampered"))
  await connection.db
    .update(organizationMemberTable)
    .set({ issuer: "https://other.example.test/" })
    .where(eq(organizationMemberTable.userId, data.members[0]!.userId))
  expect((await request("GET", "/runs/expired")).status).toBe(409)
  expect(
    await connection.db.select().from(e2eFixtureRunTable).where(eq(e2eFixtureRunTable.runId, "e2etampered")),
  ).toHaveLength(1)
  await connection.db
    .update(organizationMemberTable)
    .set({ issuer: config.oidcIssuer })
    .where(eq(organizationMemberTable.userId, data.members[0]!.userId))
  expect((await request("DELETE", "/runs/e2etampered")).status).toBe(200)
})

test("verified members store only sanitized bounded run-owned diagnostics; ordinary users still use the journal", async () => {
  const runId = "diagnosticone"
  const otherRunId = "diagnostictwo"
  const issued = (await (await request("POST", "/runs", { runId })).json()) as {
    members: { userId: string }[]
  }
  const other = (await (await request("POST", "/runs", { runId: otherRunId })).json()) as {
    members: { userId: string }[]
  }
  const first = issued.members[0]!.userId
  const second = issued.members[1]!.userId
  const unrelated = "ordinary-diagnostic-user"
  await connection.db.insert(applicationUserTable).values({ id: unrelated, displayName: "Ordinary User" })
  const journal: unknown[] = []
  const api = new Hono<AppEnvironment>()
  api.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: context.req.header("X-Test-User") ?? "" })
    await next()
  })
  apiDiagnosticsRoutesAdd(api, {
    configuration: config,
    database: connection.db,
    clientLogJournalWrite: async (entry) => {
      journal.push(entry)
    },
  })
  const ingest = (userId: string, message: string) =>
    api.request("https://preview.codeline.work/diagnostics/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-User": userId },
      body: JSON.stringify({ logs: [{ level: "error", source: "console.error", message }] }),
    })
  const read = (id: string, authorization = `Bearer ${secret}`) =>
    request("GET", `/runs/${id}/diagnostics`, undefined, authorization)

  expect((await read(runId, "")).status).toBe(401)
  expect((await read(runId, "Bearer wrong")).status).toBe(401)
  expect((await read("bad_id")).status).toBe(400)
  expect(await (await read("diagnosticmissing")).json()).toEqual({ exists: false, entries: [] })
  expect((await ingest(first, "first /path?token=private Bearer secret")).status).toBe(200)
  expect((await ingest(second, "second /path?token=private")).status).toBe(200)
  expect((await ingest(other.members[0]!.userId, "other-run")).status).toBe(200)
  expect((await ingest(unrelated, "ordinary-user")).status).toBe(200)
  expect(journal).toHaveLength(1)
  expect(JSON.stringify(journal)).toContain("ordinary-user")
  const response = await read(runId)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
  const entries = ((await response.json()) as { entries: Record<string, unknown>[] }).entries
  expect(entries).toHaveLength(2)
  expect(entries.map((entry) => entry.userId)).toEqual([first, second])
  expect(entries.every((entry) => entry.eventType === "client-log")).toBe(true)
  expect(JSON.stringify(entries)).toContain("[REDACTED]")
  expect(JSON.stringify(entries)).not.toContain("private")
  expect(JSON.stringify(entries)).not.toContain("Bearer secret")
  expect(JSON.stringify(entries)).not.toContain("?token=")
  expect((await read(otherRunId)).json().then((body) => body.entries)).resolves.toHaveLength(1)

  for (let index = 0; index < 135; index += 1) {
    expect((await ingest(first, `bounded-${index}`)).status).toBe(200)
  }
  const bounded = (await (await read(runId)).json()) as { entries: Record<string, unknown>[] }
  expect(bounded.entries).toHaveLength(128)
  expect(JSON.stringify(bounded.entries)).not.toContain('bounded-0"')
  expect(JSON.stringify(bounded.entries)).toContain("bounded-134")
  expect(
    await connection.db.select().from(e2eFixtureDiagnosticTable).where(eq(e2eFixtureDiagnosticTable.runId, runId)),
  ).toHaveLength(128)

  await connection.db
    .update(organizationMemberTable)
    .set({ subject: "tampered" })
    .where(eq(organizationMemberTable.userId, first))
  expect((await read(runId)).status).toBe(409)
  expect((await ingest(first, "must-not-print")).status).toBe(500)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  expect(journal).toHaveLength(1)
  await connection.db
    .update(organizationMemberTable)
    .set({ subject: `e2e-organization-member-${runId}-1` })
    .where(eq(organizationMemberTable.userId, first))
  await connection.db
    .insert(e2eFixtureDiagnosticTable)
    .values({ runId, userId: unrelated, entry: { message: "foreign" } })
  expect((await read(runId)).status).toBe(409)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(409)
  expect(
    await connection.db.select().from(e2eFixtureDiagnosticTable).where(eq(e2eFixtureDiagnosticTable.runId, runId)),
  ).toHaveLength(129)
  await connection.db.delete(e2eFixtureDiagnosticTable).where(eq(e2eFixtureDiagnosticTable.userId, unrelated))
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
  expect(await (await read(runId)).json()).toEqual({ exists: false, entries: [] })
  expect(
    await connection.db.select().from(e2eFixtureDiagnosticTable).where(eq(e2eFixtureDiagnosticTable.runId, runId)),
  ).toEqual([])
  expect((await read(otherRunId)).json().then((body) => body.entries)).resolves.toHaveLength(1)
  expect((await request("DELETE", `/runs/${otherRunId}`)).status).toBe(200)
  await connection.db.delete(applicationUserTable).where(eq(applicationUserTable.id, unrelated))
})

test("diagnostic capture verifies fixture membership without validating cloned data and rejects tampered members", async () => {
  const runId = "diagnosticmember"
  const issued = (await (await request("POST", "/runs", { runId })).json()) as {
    members: { userId: string }[]
  }
  const userId = issued.members[0]!.userId
  const journal: unknown[] = []
  const api = new Hono<AppEnvironment>()
  api.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: context.req.header("X-Test-User") ?? "" })
    await next()
  })
  apiDiagnosticsRoutesAdd(api, {
    configuration: config,
    database: connection.db,
    clientLogJournalWrite: async (entry) => {
      journal.push(entry)
    },
  })
  const ingest = () =>
    api.request("https://preview.codeline.work/diagnostics/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-User": userId },
      body: JSON.stringify({ logs: [{ level: "error", source: "console.error", message: "verified" }] }),
    })

  // An invalid cloned-data manifest makes full run status fail. Diagnostic
  // ownership only depends on the fixture's verified member marker.
  await connection.db.insert(e2eSampleSessionsTable).values({
    runId,
    createdAt: new Date(),
    userId,
    issuer: config.oidcIssuer,
    organizationId: "fixture-organization",
    mapping: {},
  })
  expect((await request("GET", `/runs/${runId}`)).status).toBe(409)
  expect((await ingest()).status).toBe(200)
  expect(
    await connection.db.select().from(e2eFixtureDiagnosticTable).where(eq(e2eFixtureDiagnosticTable.runId, runId)),
  ).toHaveLength(1)
  expect(journal).toEqual([])

  await connection.db.delete(e2eSampleSessionsTable).where(eq(e2eSampleSessionsTable.runId, runId))
  await connection.db
    .update(organizationMemberTable)
    .set({ subject: "tampered-diagnostic-member" })
    .where(eq(organizationMemberTable.userId, userId))
  expect((await ingest()).status).toBe(500)
  expect(
    await connection.db.select().from(e2eFixtureDiagnosticTable).where(eq(e2eFixtureDiagnosticTable.runId, runId)),
  ).toHaveLength(1)
  expect(journal).toEqual([])

  await connection.db
    .update(organizationMemberTable)
    .set({ subject: `e2e-organization-member-${runId}-1` })
    .where(eq(organizationMemberTable.userId, userId))
  expect((await request("DELETE", `/runs/${runId}`)).status).toBe(200)
})
