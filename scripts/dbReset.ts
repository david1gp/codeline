import postgres from "postgres"
import { managedDatabaseConsumersStop } from "./managedDatabaseConsumersStop.js"
import { managedPostgresServiceEnsure } from "./managedPostgresServiceEnsure.js"
import { managedPostgresTargetAssert } from "./managedPostgresTargetAssert.js"

const argumentsList = Bun.argv.slice(2)
if (argumentsList.length > 0) {
  console.error("Usage: bun scripts/dbReset.ts")
  process.exit(1)
}

const target = managedPostgresTargetAssert()
if (!target.success) {
  console.error(target.errorMessage)
  process.exit(1)
}

const consumers = managedDatabaseConsumersStop()
if (!consumers.success) {
  console.error(consumers.errorMessage)
  process.exit(1)
}

const service = managedPostgresServiceEnsure()
if (!service.success) {
  console.error(service.errorMessage)
  process.exit(1)
}

const client = postgres(target.data.databaseUrl, { max: 1 })
try {
  await client.begin(async (transaction) => {
    const schemas = await transaction<{ schemaName: string }[]>`
      SELECT schema_name AS "schemaName"
      FROM information_schema.schemata
      WHERE schema_name = 'public'
        OR schema_name IN ('drizzle', 'identity')
        OR schema_name LIKE 'codeline%'
      ORDER BY schema_name DESC
    `
    for (const schema of schemas) {
      if (schema.schemaName === "public") continue
      const identifier = `"${schema.schemaName.replaceAll('"', '""')}"`
      await transaction.unsafe(`DROP SCHEMA ${identifier} CASCADE`)
    }
    await transaction.unsafe('DROP SCHEMA "public" CASCADE')
    await transaction.unsafe('CREATE SCHEMA "public"')
    await transaction.unsafe('GRANT ALL ON SCHEMA "public" TO PUBLIC')
  })
  console.log("Reset PostgreSQL development schemas.")
} catch (error) {
  console.error(error instanceof Error ? error.message : "PostgreSQL reset failed.")
  process.exitCode = 1
} finally {
  await client.end()
}
