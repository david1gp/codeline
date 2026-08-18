import { afterAll, beforeEach, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import postgres from "postgres"

const migrationPath = new URL("../src/database/migrations/0013_organization_server_ownership.sql", import.meta.url)
const databaseClient = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline", {
  max: 1,
})
const databaseAvailable = await databaseClient`SELECT 1`.then(
  () => true,
  () => false,
)
const migration = await readFile(migrationPath, "utf8")

function migrationStatementExtract(startMarker: string, endMarker: string): string {
  const start = migration.indexOf(startMarker)
  const end = migration.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error(`Migration statement ${startMarker} was not found.`)
  return migration.slice(start, end + endMarker.length)
}

const organizationInsert = migrationStatementExtract("DO $organization_external_id$", "$organization_external_id$;")
const duplicateNameRepair = migrationStatementExtract("DO $duplicate_server_names$", "$duplicate_server_names$;")

beforeEach(async () => {
  if (!databaseAvailable) return
  await databaseClient.unsafe(`
    CREATE TEMP TABLE IF NOT EXISTS "server" (
      "id" text PRIMARY KEY,
      "organization_id" text NOT NULL,
      "name" text NOT NULL,
      "endpoint" text NOT NULL,
      "metadata" text NOT NULL DEFAULT '{}',
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `)
  await databaseClient.unsafe('TRUNCATE TABLE "server"')
})

afterAll(async () => {
  await databaseClient.end()
})

test("organization migration backfills servers into the deterministic Contentoren organization", async () => {
  expect(migration).toContain('CREATE TABLE "organization"')
  expect(migration).toContain('CREATE TABLE "organization_member"')
  expect(migration).toContain("current_setting('codeline.organization_external_id', true)")
  expect(migration).toContain("RAISE EXCEPTION 'ZITADEL_ORGANIZATION_ID is required")
  expect(migration.indexOf("RAISE EXCEPTION")).toBeLessThan(
    migration.indexOf('ALTER TABLE "server" ADD COLUMN "organization_id"'),
  )
  expect(migration).not.toContain("organization_external_id := 'contentoren'")
  expect(migration).not.toContain("legacy:contentoren")
  expect(migration).toContain('ALTER TABLE "server" ADD COLUMN "organization_id" text;')
  expect(migration).toContain('UPDATE "server" SET "organization_id" = \'contentoren\'')
  expect(migration).toContain('ALTER TABLE "server" DROP COLUMN "owner_user_id";')
  expect(migration).toContain('"server_organization_name_unique"')
  expect(migration).not.toContain("process.env")
})

test("organization migration rejects missing and blank external organization IDs", () => {
  expect(organizationInsert).toContain(
    "organization_external_id := NULLIF(btrim(current_setting('codeline.organization_external_id', true)), '')",
  )
  expect(organizationInsert).toContain("IF organization_external_id IS NULL THEN")
  expect(organizationInsert).toContain("RAISE EXCEPTION 'ZITADEL_ORGANIZATION_ID is required")
  expect(organizationInsert).not.toContain("organization_external_id := 'contentoren'")
})

test.skipIf(!databaseAvailable)(
  "migration maps the Contentoren organization to the configured external ID",
  async () => {
    const organizationExternalId = "configured-contentoren-organization"
    await databaseClient.unsafe(
      'CREATE TEMP TABLE IF NOT EXISTS "organization" ("id" text PRIMARY KEY, "external_id" text NOT NULL, "name" text NOT NULL, "updated_at" timestamp with time zone NOT NULL DEFAULT now())',
    )
    await databaseClient.unsafe('TRUNCATE TABLE "organization"')
    await databaseClient.unsafe("SELECT set_config('codeline.organization_external_id', $1, false)", [
      organizationExternalId,
    ])
    await databaseClient.unsafe(organizationInsert)

    const organizations = await databaseClient<{ id: string; external_id: string; name: string }[]>`
    SELECT "id", "external_id", "name" FROM "organization"
  `
    expect([...organizations]).toEqual([
      { id: "contentoren", external_id: organizationExternalId, name: "Contentoren" },
    ])
  },
)

test.skipIf(!databaseAvailable)(
  "migration repairs duplicate names around pre-existing generated-looking names",
  async () => {
    const servers = [
      ["server-a", "Build", "http://server-a.test", { value: "a" }],
      ["server-b", "Build", "http://server-b.test", { value: "b" }],
      ["server-c", "Build [server-b]", "http://server-c.test", { value: "c" }],
      ["server-d", "Build", "http://server-d.test", { value: "d" }],
      ["server-e", "Build [server-d]", "http://server-e.test", { value: "e" }],
      ["server-f", "Build [server-b-2]", "http://server-f.test", { value: "f" }],
    ] as const
    for (const [id, name, endpoint, metadata] of servers) {
      await databaseClient.unsafe(
        'INSERT INTO "server" ("id", "organization_id", "name", "endpoint", "metadata") VALUES ($1, $2, $3, $4, $5)',
        [id, "contentoren", name, endpoint, JSON.stringify(metadata)],
      )
    }

    await databaseClient.unsafe(duplicateNameRepair)

    const storedServers = await databaseClient<{ id: string; name: string; endpoint: string; metadata: string }[]>`
    SELECT "id", "name", "endpoint", "metadata"
    FROM "server"
    ORDER BY "id"
  `
    expect([...storedServers]).toEqual([
      { id: "server-a", name: "Build", endpoint: "http://server-a.test", metadata: '{"value":"a"}' },
      { id: "server-b", name: "Build [server-b-3]", endpoint: "http://server-b.test", metadata: '{"value":"b"}' },
      { id: "server-c", name: "Build [server-b]", endpoint: "http://server-c.test", metadata: '{"value":"c"}' },
      { id: "server-d", name: "Build [server-d-2]", endpoint: "http://server-d.test", metadata: '{"value":"d"}' },
      { id: "server-e", name: "Build [server-d]", endpoint: "http://server-e.test", metadata: '{"value":"e"}' },
      { id: "server-f", name: "Build [server-b-2]", endpoint: "http://server-f.test", metadata: '{"value":"f"}' },
    ])

    const duplicateNames = await databaseClient<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM (
      SELECT "organization_id", "name"
      FROM "server"
      GROUP BY "organization_id", "name"
      HAVING count(*) > 1
    ) duplicates
  `
    expect([...duplicateNames]).toEqual([{ count: "0" }])
  },
)
