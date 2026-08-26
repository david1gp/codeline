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
import { oidcIssuerCanonicalize } from "../oidc/oidcIssuerCanonicalize.js"

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
  const canonicalIssuer = oidcIssuerCanonicalize(profile.issuer)
  if (!canonicalIssuer.success) return createResultError(op, canonicalIssuer.errorMessage)

  try {
    const existingIdentity = await oidcExternalIdentityEquivalentLoad(database, canonicalIssuer.data, profile.subject)
    const proposedUserId = `oidc:${createHash("sha256").update(`${canonicalIssuer.data}\0${profile.subject}`).digest("hex")}`
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
        issuer: canonicalIssuer.data,
        subject: profile.subject,
        userId,
      })
      if (!storedIdentity.success) return createResultError(op, storedIdentity.errorMessage)
      if (storedIdentity.data.userId !== userId) {
        return createResultError(op, "The external identity is already linked to another user.")
      }
    }

    const membership = await oidcOrganizationMembershipUpsert(database, {
      issuer: canonicalIssuer.data,
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

async function oidcExternalIdentityEquivalentLoad(
  database: Pick<DatabaseExecutor, "query">,
  issuer: string,
  subject: string,
): Promise<typeof externalIdentityTable.$inferSelect | undefined> {
  const exactIdentity = await database.query.externalIdentityTable.findFirst({
    where: and(eq(externalIdentityTable.issuer, issuer), eq(externalIdentityTable.subject, subject)),
  })
  if (exactIdentity !== undefined) return exactIdentity

  const findMany = database.query.externalIdentityTable.findMany
  if (typeof findMany !== "function") return undefined
  const identities = await database.query.externalIdentityTable.findMany({
    where: eq(externalIdentityTable.subject, subject),
  })
  return identities.find((identity) => {
    const identityIssuer = oidcIssuerCanonicalize(identity.issuer)
    return identityIssuer.success && identityIssuer.data === issuer
  })
}
