import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { e2eEnvironmentAssertLocal } from "./e2eEnvironmentAssertLocal.js"
import { e2eIdentityRunPurge } from "./e2eIdentityRunPurge.js"
import { e2eIdentitySubjectPrefixCreate } from "./e2eIdentitySubjectPrefixCreate.js"

/**
 * Removes the synthetic identities of one end-to-end run and every row that
 * depends on them. It runs after passing and failing runs alike and only against
 * the repository-managed local development database.
 */

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

const databaseClient = postgres(environment.data.databaseUrl)
const database = drizzle(databaseClient, { schema: databaseSchema })
const purged = await e2eIdentityRunPurge(database, e2eIdentitySubjectPrefixCreate(runId))
await databaseClient.end()

if (!purged.success) {
  console.error(purged.errorMessage)
  process.exit(1)
}

console.log(JSON.stringify({ deletedUserIds: purged.data.deletedUserIds }))
