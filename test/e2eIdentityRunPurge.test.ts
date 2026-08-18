import { afterAll, expect, test } from "bun:test"
import { and, eq, inArray, like } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { externalIdentityTable } from "../src/identity/db/externalIdentityTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { e2eIdentityRunPurge } from "../scripts/e2eIdentityRunPurge.js"
import { e2eIdentitySubjectPrefixCreate } from "../scripts/e2eIdentitySubjectPrefixCreate.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const issuer = "https://purge-test.example.test"
const organizationId = `purge-test-organization-${uuidv7()}`
const createdUserIds: string[] = []

afterAll(async () => {
  if (databaseAvailable) {
    if (createdUserIds.length > 0) {
      await database.delete(applicationUserTable).where(inArray(applicationUserTable.id, createdUserIds))
    }
    await database.delete(organizationTable).where(eq(organizationTable.id, organizationId))
  }
  await client.end()
})

async function organizationEnsure(): Promise<void> {
  await database
    .insert(organizationTable)
    .values({ id: organizationId, externalId: organizationId, name: "Purge Test Organization" })
    .onConflictDoNothing()
}

async function memberCreate(subject: string, options: { withMembership: boolean }): Promise<string> {
  const userId = `purge-test-user-${uuidv7()}`
  createdUserIds.push(userId)
  await database.insert(applicationUserTable).values({ id: userId, displayName: `Purge Test ${subject}` })
  await database.insert(externalIdentityTable).values({ id: `purge-test-${uuidv7()}`, userId, issuer, subject })
  // Omitting the membership row simulates an issuing run interrupted between the
  // identity upsert and the membership synchronization.
  if (options.withMembership) {
    await database.insert(organizationMemberTable).values({ organizationId, userId, issuer, subject })
  }
  return userId
}

test("the purge refuses a subject prefix outside its own namespace", async () => {
  const refused = await e2eIdentityRunPurge(database, "seed-example-")
  expect(refused.success).toBe(false)
  if (refused.success) return
  expect(refused.errorMessage).toContain("namespace")
})

test.skipIf(!databaseAvailable)("the purge removes a full run and leaves other runs untouched", async () => {
  await organizationEnsure()
  const purgedPrefix = e2eIdentitySubjectPrefixCreate(`purgea${Date.now().toString(36)}`)
  const keptPrefix = e2eIdentitySubjectPrefixCreate(`purgeb${Date.now().toString(36)}`)
  const firstUserId = await memberCreate(`${purgedPrefix}1`, { withMembership: true })
  const secondUserId = await memberCreate(`${purgedPrefix}2`, { withMembership: true })
  const keptUserId = await memberCreate(`${keptPrefix}1`, { withMembership: true })

  const purged = await e2eIdentityRunPurge(database, purgedPrefix)
  expect(purged.success).toBe(true)
  if (!purged.success) return
  expect(purged.data.deletedUserIds.sort()).toEqual([firstUserId, secondUserId].sort())

  const remainingUsers = await database
    .select({ id: applicationUserTable.id })
    .from(applicationUserTable)
    .where(inArray(applicationUserTable.id, [firstUserId, secondUserId, keptUserId]))
  expect(remainingUsers.map((row) => row.id)).toEqual([keptUserId])

  const remainingIdentities = await database
    .select({ subject: externalIdentityTable.subject })
    .from(externalIdentityTable)
    .where(like(externalIdentityTable.subject, "e2e-organization-member-%"))
  expect(remainingIdentities.some((row) => row.subject.startsWith(purgedPrefix))).toBe(false)
  expect(remainingIdentities.some((row) => row.subject.startsWith(keptPrefix))).toBe(true)

  const remainingMemberships = await database
    .select({ subject: organizationMemberTable.subject })
    .from(organizationMemberTable)
    .where(and(eq(organizationMemberTable.organizationId, organizationId), eq(organizationMemberTable.issuer, issuer)))
  expect(remainingMemberships.some((row) => row.subject.startsWith(purgedPrefix))).toBe(false)
  expect(remainingMemberships.some((row) => row.subject.startsWith(keptPrefix))).toBe(true)
})

test.skipIf(!databaseAvailable)("the purge also removes a partially created run without a membership", async () => {
  await organizationEnsure()
  const prefix = e2eIdentitySubjectPrefixCreate(`purgec${Date.now().toString(36)}`)
  const userId = await memberCreate(`${prefix}1`, { withMembership: false })

  const purged = await e2eIdentityRunPurge(database, prefix)
  expect(purged.success).toBe(true)
  if (!purged.success) return
  expect(purged.data.deletedUserIds).toEqual([userId])

  const identities = await database
    .select({ subject: externalIdentityTable.subject })
    .from(externalIdentityTable)
    .where(like(externalIdentityTable.subject, `${prefix}%`))
  const memberships = await database
    .select({ subject: organizationMemberTable.subject })
    .from(organizationMemberTable)
    .where(like(organizationMemberTable.subject, `${prefix}%`))
  expect(identities).toEqual([])
  expect(memberships).toEqual([])
})

test.skipIf(!databaseAvailable)("a repeated purge of an already clean run stays successful", async () => {
  const prefix = e2eIdentitySubjectPrefixCreate(`purged${Date.now().toString(36)}`)
  const first = await e2eIdentityRunPurge(database, prefix)
  const second = await e2eIdentityRunPurge(database, prefix)
  expect(first.success).toBe(true)
  expect(second.success).toBe(true)
  if (!second.success) return
  expect(second.data.deletedUserIds).toEqual([])
})
