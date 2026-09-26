import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { expect, test } from "bun:test"
import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { dbInspectOrganization } from "../../scripts/dbInspectOrganization.js"
import { oidcEnvironmentConfigurationResolve } from "../../scripts/oidcEnvironmentConfigurationResolve.js"
import { databaseSchema } from "../../src/database/databaseSchema.js"
import { exampleDataFixture } from "../../src/database/exampleDataFixture.js"
import { organizationTable } from "../../src/identity/db/organizationTable.js"

test("organization inspection handles empty, missing, multiple, and differently configured rows", async () => {
  const client = createClient({ url: "file::memory:" })
  const database = drizzle(client, { schema: databaseSchema })

  try {
    await client.execute(
      "CREATE TABLE identity_organization (id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    )

    const configuredOrganization = oidcEnvironmentConfigurationResolve({ OIDC_ORGANIZATION_ID: "configured-org" })
    expect(configuredOrganization.success).toBe(true)

    const emptyInspection = await dbInspectOrganization(database, configuredOrganization)
    expect(emptyInspection).toEqual({
      success: true,
      data: {
        organizationCount: 0,
        exampleOrganizationSeeded: false,
        configuredOrganizationMatches: false,
      },
    })

    await database.insert(organizationTable).values({
      id: "unrelated-row",
      externalId: "unrelated-org",
      name: "Unrelated",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
    const missingSeedInspection = await dbInspectOrganization(database, configuredOrganization)
    expect(missingSeedInspection).toEqual({
      success: true,
      data: {
        organizationCount: 1,
        exampleOrganizationSeeded: false,
        configuredOrganizationMatches: false,
      },
    })

    await database.insert(organizationTable).values([
      {
        id: exampleDataFixture.organization.id,
        externalId: "seeded-org",
        name: "Seeded",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      {
        id: "another-row",
        externalId: "configured-org",
        name: "Another",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ])
    const multipleInspection = await dbInspectOrganization(database, configuredOrganization)
    expect(multipleInspection).toEqual({
      success: true,
      data: {
        organizationCount: 3,
        exampleOrganizationSeeded: true,
        configuredOrganizationMatches: false,
      },
    })

    const differentIdConfiguration = oidcEnvironmentConfigurationResolve({ OIDC_ORGANIZATION_ID: "other-config" })
    const differentIdInspection = await dbInspectOrganization(database, differentIdConfiguration)
    expect(differentIdInspection).toEqual({
      success: true,
      data: {
        organizationCount: 3,
        exampleOrganizationSeeded: true,
        configuredOrganizationMatches: false,
      },
    })
  } finally {
    client.close()
  }
})

test("organization inspection rejects invalid OIDC configuration without exposing values", async () => {
  const client = createClient({ url: "file::memory:" })
  const database = drizzle(client, { schema: databaseSchema })

  try {
    await client.execute(
      "CREATE TABLE identity_organization (id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    )
    const invalidConfiguration = oidcEnvironmentConfigurationResolve({
      OIDC_ORGANIZATION_ID: "private-one",
      OIDC_ALLOWED_ORGANIZATION_ID: "private-two",
    })
    const inspection = await dbInspectOrganization(database, invalidConfiguration)
    expect(inspection).toEqual({ success: false, error: "OIDC environment configuration is invalid." })
    expect(JSON.stringify(inspection)).not.toContain("private")
  } finally {
    client.close()
  }
})

test("libsql opens an existing file URL and query_only prevents writes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "db-inspect-organization-"))
  const databasePath = join(directory, "inspection.sqlite")
  const client = createClient({ url: pathToFileURL(databasePath).href })

  try {
    await client.execute("CREATE TABLE inspection (id INTEGER)")
    await client.execute("PRAGMA query_only = ON")

    expect(await client.execute("SELECT id FROM inspection")).toMatchObject({ rows: [] })
    await expect(client.execute("INSERT INTO inspection VALUES (1)")).rejects.toThrow()
  } finally {
    client.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
