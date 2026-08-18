import { expect, test } from "bun:test"
import { oidcOrganizationMembershipUpsert } from "../src/identity/db/oidcOrganizationMembershipUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"

const organization = { id: "contentoren", externalId: "organization-a", name: "Contentoren" }

test("OIDC organization membership upsert is idempotent for an issuer and subject", async () => {
  let storedMembership: Record<string, unknown> | undefined
  let insertCount = 0
  const database = {
    insert: (table: unknown) => {
      expect(table).toBe(organizationMemberTable)
      return {
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
            returning: async () => {
              insertCount += 1
              storedMembership = { ...storedMembership, ...values, ...set }
              return [storedMembership]
            },
          }),
        }),
      }
    },
    query: {
      organizationTable: { findFirst: async () => organization },
    },
  } as never

  const first = await oidcOrganizationMembershipUpsert(database, {
    issuer: "https://issuer.test",
    organizationExternalId: organization.externalId,
    subject: "subject-a",
    userId: "oidc:user-a",
  })
  const second = await oidcOrganizationMembershipUpsert(database, {
    issuer: "https://issuer.test",
    organizationExternalId: organization.externalId,
    subject: "subject-a",
    userId: "oidc:user-a",
  })

  expect(first.success).toBe(true)
  expect(second.success).toBe(true)
  expect(insertCount).toBe(2)
  expect(storedMembership).toMatchObject({
    issuer: "https://issuer.test",
    organizationId: organization.id,
    subject: "subject-a",
    userId: "oidc:user-a",
  })
})

test("OIDC organization membership upsert rejects an organization that is not mapped", async () => {
  let insertCalled = false
  const database = {
    insert: () => {
      insertCalled = true
      return {}
    },
    query: {
      organizationTable: { findFirst: async () => undefined },
    },
  } as never

  const result = await oidcOrganizationMembershipUpsert(database, {
    issuer: "https://issuer.test",
    organizationExternalId: "missing-organization",
    subject: "subject-a",
    userId: "oidc:user-a",
  })

  expect(result.success).toBe(false)
  expect(insertCalled).toBe(false)
})
