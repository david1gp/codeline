import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { DatabaseExecutor } from "../src/database/databaseClient.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { identitySessionCreate } from "../src/identity/actions/identitySessionCreate.js"
import { oidcIdentityUpsert } from "../src/identity/actions/oidcIdentityUpsert.js"
import { organizationMemberLoad } from "../src/identity/actions/organizationMemberLoad.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { e2eEnvironmentAssertLocal } from "./e2eEnvironmentAssertLocal.js"
import { e2eIdentityRunPurge } from "./e2eIdentityRunPurge.js"
import { e2eIdentitySubjectPrefixCreate } from "./e2eIdentitySubjectPrefixCreate.js"

/**
 * Issues opaque application sessions for two run-unique synthetic members of the
 * configured organization and prints them as JSON. The identities are stored
 * through the same upsert the OIDC callback uses, so organization authorization
 * stays in force and the end-to-end run needs no interactive provider password.
 * The script only runs against the repository-managed local development database.
 */

type IssuedMember = {
  displayName: string
  expiresAt: string
  token: string
  userId: string
}

async function membersIssue(
  database: DatabaseExecutor,
  input: { issuer: string; organizationExternalId: string; runId: string; subjectPrefix: string },
): Promise<Result<{ members: IssuedMember[]; organizationId: string }>> {
  const op = "membersIssue"
  const organization = await database.query.organizationTable.findFirst({
    where: eq(organizationTable.externalId, input.organizationExternalId),
  })
  if (organization === undefined) {
    return createResultError(op, "The configured organization is not seeded; run bun run db:seed first.")
  }

  const members: IssuedMember[] = []
  for (const index of [1, 2]) {
    const subject = `${input.subjectPrefix}${index}`
    const user = await oidcIdentityUpsert(database, {
      displayName: `E2E Member ${index} ${input.runId}`,
      issuer: input.issuer,
      organizationExternalId: input.organizationExternalId,
      subject,
      verifiedEmail: `${subject}@example.test`,
    })
    if (!user.success) return user

    const membership = await organizationMemberLoad(database, user.data.id, input.organizationExternalId, input.issuer)
    if (!membership.success) return membership
    if (membership.data === undefined || membership.data.organizationId !== organization.id) {
      return createResultError(op, "The issued member does not belong to the configured organization.")
    }

    const session = await identitySessionCreate(database, user.data.id)
    if (!session.success) return session

    members.push({
      displayName: user.data.displayName,
      expiresAt: session.data.session.expiresAt.toISOString(),
      token: session.data.token,
      userId: user.data.id,
    })
  }
  return createResult({ members, organizationId: organization.id })
}

const runId = Bun.argv[2]
if (runId === undefined || !/^[0-9a-z]{6,40}$/.test(runId)) {
  console.error("A lowercase alphanumeric run identifier argument is required.")
  process.exit(1)
}

const environment = e2eEnvironmentAssertLocal()
if (!environment.success) {
  console.error(environment.errorMessage)
  process.exit(1)
}

const subjectPrefix = e2eIdentitySubjectPrefixCreate(runId)
const databaseClient = postgres(environment.data.databaseUrl)
const database = drizzle(databaseClient, { schema: databaseSchema })
const issued = await membersIssue(database, {
  issuer: environment.data.issuer,
  organizationExternalId: environment.data.organizationExternalId,
  runId,
  subjectPrefix,
})

if (!issued.success) {
  console.error(issued.errorMessage)
  await e2eIdentityRunPurge(database, subjectPrefix)
  await databaseClient.end()
  process.exit(1)
}

await databaseClient.end()
console.log(
  JSON.stringify({
    members: issued.data.members,
    organizationExternalId: environment.data.organizationExternalId,
    organizationId: issued.data.organizationId,
    subjectPrefix,
  }),
)
