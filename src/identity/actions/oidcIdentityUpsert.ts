import { createHash } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import type { ApplicationUser } from "../db/applicationUserTable.js"
import { applicationUserTable } from "../db/applicationUserTable.js"
import { applicationUserUpsert } from "../db/applicationUserUpsert.js"
import { externalIdentityTable } from "../db/externalIdentityTable.js"
import { externalIdentityUpsert } from "../db/externalIdentityUpsert.js"
import { oidcOrganizationMembershipUpsert } from "../db/oidcOrganizationMembershipUpsert.js"

type OidcIdentityProfile = {
  displayName?: string
  verifiedEmail?: string
  organizationExternalId: string
  issuer: string
  subject: string
}

export async function oidcIdentityUpsert(
  database: Pick<DatabaseExecutor, "insert" | "query">,
  profile: OidcIdentityProfile,
): Promise<Result<ApplicationUser>> {
  const op = "oidcIdentityUpsert"
  const identityWhere = and(
    eq(externalIdentityTable.issuer, profile.issuer),
    eq(externalIdentityTable.subject, profile.subject),
  )

  try {
    const existingIdentity = await database.query.externalIdentityTable.findFirst({ where: identityWhere })
    const proposedUserId = `oidc:${createHash("sha256").update(`${profile.issuer}\0${profile.subject}`).digest("hex")}`
    const userId = existingIdentity?.userId ?? proposedUserId
    const existingUser = await database.query.applicationUserTable.findFirst({
      where: eq(applicationUserTable.id, userId),
    })
    const storedUser = await applicationUserUpsert(database, {
      displayName: profile.displayName ?? existingUser?.displayName ?? profile.subject,
      id: userId,
      ...(profile.verifiedEmail === undefined ? {} : { email: profile.verifiedEmail }),
    })
    if (!storedUser.success) return createResultError(op, storedUser.errorMessage)

    if (existingIdentity === undefined) {
      const storedIdentity = await externalIdentityUpsert(database, {
        issuer: profile.issuer,
        subject: profile.subject,
        userId,
      })
      if (!storedIdentity.success) return createResultError(op, storedIdentity.errorMessage)
      if (storedIdentity.data.userId !== userId) {
        return createResultError(op, "The external identity is already linked to another user.")
      }
    }

    const membership = await oidcOrganizationMembershipUpsert(database, {
      issuer: profile.issuer,
      organizationExternalId: profile.organizationExternalId,
      subject: profile.subject,
      userId,
    })
    if (!membership.success) return createResultError(op, membership.errorMessage)
    return createResult(storedUser.data)
  } catch (_error) {
    return createResultError(op, "The OIDC identity could not be stored.")
  }
}
