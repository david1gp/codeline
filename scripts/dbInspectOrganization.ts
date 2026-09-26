import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@libsql/client"
import { count } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { databasePath } from "../src/database/databasePath.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataFixture } from "../src/database/exampleDataFixture.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { oidcEnvironmentConfigurationResolve } from "./oidcEnvironmentConfigurationResolve.js"

export async function dbInspectOrganization(
  database: ReturnType<typeof drizzle<typeof databaseSchema>>,
  configuredOrganization: ReturnType<typeof oidcEnvironmentConfigurationResolve>,
) {
  if (!configuredOrganization.success) {
    return { success: false as const, error: "OIDC environment configuration is invalid." }
  }

  const [organizationSummary] = await database.select({ organizationCount: count() }).from(organizationTable)
  const organizations = await database
    .select({ id: organizationTable.id, externalId: organizationTable.externalId })
    .from(organizationTable)
  const seededOrganizationExists = organizations.some(
    (organization) => organization.id === exampleDataFixture.organization.id,
  )
  const seededAndConfiguredOrganizationMatch = organizations.some(
    (organization) =>
      organization.id === exampleDataFixture.organization.id &&
      organization.externalId === configuredOrganization.data.organizationExternalId,
  )

  return {
    success: true as const,
    data: {
      organizationCount: organizationSummary?.organizationCount ?? 0,
      exampleOrganizationSeeded: seededOrganizationExists,
      configuredOrganizationMatches: seededAndConfiguredOrganizationMatch,
    },
  }
}

if (import.meta.main) {
  if (!existsSync(databasePath)) {
    console.error("Organization inspection failed.")
    process.exitCode = 1
  } else {
    const client = createClient({ url: pathToFileURL(resolve(databasePath)).href })
    const database = drizzle(client, { schema: databaseSchema })

    try {
      await client.execute("PRAGMA query_only = ON")
      const inspection = await dbInspectOrganization(database, oidcEnvironmentConfigurationResolve())
      if (!inspection.success) {
        console.error(inspection.error)
        process.exitCode = 1
      } else {
        console.log(JSON.stringify(inspection.data))
      }
    } catch {
      console.error("Organization inspection failed.")
      process.exitCode = 1
    } finally {
      client.close()
    }
  }
}
