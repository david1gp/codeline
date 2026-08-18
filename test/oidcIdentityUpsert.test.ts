import { expect, test } from "bun:test"
import { oidcIdentityUpsert } from "../src/identity/actions/oidcIdentityUpsert.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { externalIdentityTable } from "../src/identity/db/externalIdentityTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"

const now = new Date("2026-08-14T12:00:00.000Z")

test("OIDC identity persistence maps case-sensitive issuer and subject without email linking", async () => {
  const first = identityDatabase()
  const firstResult = await oidcIdentityUpsert(first.database, {
    issuer: "https://issuer.test",
    organizationExternalId: "organization-a",
    subject: "Subject-A",
  })
  const second = identityDatabase()
  const secondResult = await oidcIdentityUpsert(second.database, {
    issuer: "https://issuer.test",
    organizationExternalId: "organization-a",
    subject: "subject-a",
  })

  expect(firstResult.success).toBe(true)
  expect(secondResult.success).toBe(true)
  if (!firstResult.success || !secondResult.success) return
  expect(firstResult.data.id).not.toBe(secondResult.data.id)
  expect(first.userValues?.email).toBeUndefined()
  expect(second.userValues?.email).toBeUndefined()
  expect(first.identityValues?.subject).toBe("Subject-A")
  expect(second.identityValues?.subject).toBe("subject-a")
  expect(first.membershipValues).toMatchObject({
    issuer: "https://issuer.test",
    organizationId: "organization-a",
    subject: "Subject-A",
  })
})

test("OIDC identity persistence synchronizes the organization membership on every login", async () => {
  const database = identityDatabase()
  const profile = {
    displayName: "Contentoren Member",
    issuer: "https://issuer.test",
    organizationExternalId: "organization-a",
    subject: "subject-a",
  }

  const first = await oidcIdentityUpsert(database.database, profile)
  const second = await oidcIdentityUpsert(database.database, { ...profile, displayName: "Updated Member" })

  expect(first.success).toBe(true)
  expect(second.success).toBe(true)
  if (!first.success || !second.success) return
  expect(second.data.id).toBe(first.data.id)
  expect(database.membershipValues).toMatchObject({
    issuer: profile.issuer,
    organizationId: "organization-a",
    subject: profile.subject,
    userId: first.data.id,
  })
})

test("OIDC identity persistence reuses the mapped user and updates only mutable verified profile fields", async () => {
  const existingIdentity = {
    createdAt: now,
    id: "external-existing",
    issuer: "https://issuer.test",
    subject: "subject-a",
    updatedAt: now,
    userId: "oidc-existing-user",
  }
  const existingUser = {
    createdAt: now,
    displayName: "Old Name",
    email: "old@example.test",
    id: existingIdentity.userId,
    updatedAt: now,
  }
  const database = identityDatabase(existingIdentity, existingUser)

  const unverified = await oidcIdentityUpsert(database.database, {
    displayName: "New Name",
    issuer: existingIdentity.issuer,
    organizationExternalId: "organization-a",
    subject: existingIdentity.subject,
  })
  expect(unverified.success).toBe(true)
  expect(database.conflictSet?.displayName).toBe("New Name")
  expect(database.conflictSet?.email).toBeUndefined()
  expect(database.identityValues).toBeUndefined()

  const verified = await oidcIdentityUpsert(database.database, {
    displayName: "Newest Name",
    issuer: existingIdentity.issuer,
    organizationExternalId: "organization-a",
    subject: existingIdentity.subject,
    verifiedEmail: "verified@example.test",
  })
  expect(verified.success).toBe(true)
  expect(database.conflictSet?.displayName).toBe("Newest Name")
  expect(database.conflictSet?.email).toBe("verified@example.test")
})

function identityDatabase(existingIdentity?: Record<string, unknown>, existingUser?: Record<string, unknown>) {
  let userValues: Record<string, unknown> | undefined
  let identityValues: Record<string, unknown> | undefined
  let membershipValues: Record<string, unknown> | undefined
  let conflictSet: Record<string, unknown> | undefined
  const database = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === applicationUserTable) userValues = values
        if (table === externalIdentityTable) identityValues = values
        if (table === organizationMemberTable) membershipValues = values
        return {
          onConflictDoNothing: () => ({
            returning: async () =>
              existingIdentity === undefined
                ? [
                    {
                      ...values,
                      createdAt: now,
                      id: values.id,
                      updatedAt: now,
                    },
                  ]
                : [],
          }),
          onConflictDoUpdate: (options: { set: Record<string, unknown> }) => {
            if (table === organizationMemberTable) {
              membershipValues = { ...membershipValues, ...values }
            } else {
              conflictSet = options.set
            }
            return {
              returning: async () => [
                {
                  ...existingUser,
                  ...values,
                  ...options.set,
                  createdAt: existingUser?.createdAt ?? now,
                  updatedAt: now,
                },
              ],
            }
          },
        }
      },
    }),
    query: {
      applicationUserTable: { findFirst: async () => existingUser },
      organizationTable: {
        findFirst: async () => ({ id: "organization-a", externalId: "organization-a", name: "Organization A" }),
      },
      externalIdentityTable: { findFirst: async () => existingIdentity },
    },
  } as never
  return {
    database,
    get conflictSet() {
      return conflictSet
    },
    get identityValues() {
      return identityValues
    },
    get membershipValues() {
      return membershipValues
    },
    get userValues() {
      return userValues
    },
  }
}
