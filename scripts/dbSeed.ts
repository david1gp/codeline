import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { exampleDataSeed } from "../src/database/exampleDataSeed.js"

const databaseUrl = Bun.env.DATABASE_URL
if (databaseUrl === undefined) {
  console.error("DATABASE_URL is required.")
  process.exit(1)
}

const databaseClient = postgres(databaseUrl)
const database = drizzle(databaseClient, { schema: databaseSchema })
const reset = Bun.argv.includes("--reset")
const result = await exampleDataSeed(database, { reset })

if (!result.success) {
  console.error(result.errorMessage)
  await databaseClient.end()
  process.exit(1)
}

console.log(
  `${reset ? "Reset and seeded" : "Seeded"} ${result.data.sessionCount} sessions and ${result.data.messageCount} messages.`,
)
await databaseClient.end()
