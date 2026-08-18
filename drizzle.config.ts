import { defineConfig } from "drizzle-kit"
import * as v from "valibot"

const databaseUrl = v.safeParse(v.pipe(v.string(), v.url()), process.env.DATABASE_URL)
if (!databaseUrl.success) throw new Error("DATABASE_URL is required and must be a valid URL.")

const migrationDatabaseUrl = new URL(databaseUrl.output)
const organizationExternalId = process.env.ZITADEL_ORGANIZATION_ID?.trim()
if (organizationExternalId === undefined || organizationExternalId.length === 0) {
  throw new Error("ZITADEL_ORGANIZATION_ID is required and must not be empty to run database migrations.")
}
migrationDatabaseUrl.searchParams.set("options", `-c codeline.organization_external_id=${organizationExternalId}`)

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/identity/db/*Table.ts",
    "./src/servers/db/*Table.ts",
    "./src/agents/db/*Table.ts",
    "./src/session/db/*Table.ts",
    "./src/message/db/*Table.ts",
    "./src/note/db/*Table.ts",
    "./src/run/db/*Table.ts",
    "./src/stream/db/*Table.ts",
  ],
  out: "./src/database/migrations",
  dbCredentials: {
    url: migrationDatabaseUrl.toString(),
  },
})
