import type { Result } from "@adaptive-ds/result"
import type { identitySessionCreate } from "../actions/identitySessionCreate.js"
import type { identitySessionLoad } from "../actions/identitySessionLoad.js"
import type { oidcIdentityUpsert } from "../actions/oidcIdentityUpsert.js"
import type { ApplicationUser } from "../db/applicationUserTable.js"
import type { identitySessionTable } from "../db/identitySessionTable.js"
import type { oidcLoginTransactionConsume } from "../db/oidcLoginTransactionConsume.js"
import type { oidcLoginTransactionCreate } from "../db/oidcLoginTransactionCreate.js"
import type { OrganizationMember } from "../db/organizationMemberTable.js"

type DevelopmentIdentity = {
  displayName: string
  email?: string
  identityKey: string
}

type OidcIdentityProfile = Parameters<typeof oidcIdentityUpsert>[1]
type OidcLoginTransactionInput = Parameters<typeof oidcLoginTransactionCreate>[1]
type IdentitySession = typeof identitySessionTable.$inferSelect

export type IdentityClient = {
  applicationUserLoad: (sessionToken: string) => Promise<Result<ApplicationUser | undefined>>
  developmentIdentityUpsert: (
    identity: DevelopmentIdentity,
  ) => ReturnType<typeof import("../db/developmentIdentityUpsert.js").developmentIdentityUpsert>
  developmentOrganizationMemberLoad: (
    identityKey: string,
    organizationExternalId: string,
    issuer: string,
  ) => Promise<Result<OrganizationMember | undefined>>
  identitySessionCreate: (
    userId: string,
    options?: Parameters<typeof identitySessionCreate>[2],
  ) => ReturnType<typeof identitySessionCreate>
  identitySessionLoad: (token: string, now?: Date) => ReturnType<typeof identitySessionLoad>
  identitySessionRevokeForToken: (token: string, now?: Date) => ReturnType<typeof identitySessionLoad>
  oidcLoginComplete: (
    profile: OidcIdentityProfile,
    options: {
      credentialCreate?: () => string
      idCreate?: () => string
      now: Date
      presentedToken?: string
    },
  ) => Promise<Result<{ session: IdentitySession; token: string; user: ApplicationUser }>>
  oidcLoginTransactionConsume: (
    state: string,
    now?: Date,
    browserBinding?: string,
  ) => ReturnType<typeof oidcLoginTransactionConsume>
  oidcLoginTransactionCreate: (transaction: OidcLoginTransactionInput) => ReturnType<typeof oidcLoginTransactionCreate>
  organizationMemberLoad: (
    sessionToken: string,
    organizationExternalId?: string,
    issuer?: string,
  ) => Promise<Result<OrganizationMember | undefined>>
}
