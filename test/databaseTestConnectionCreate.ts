import { drizzle } from "drizzle-orm/libsql"
import type { DatabaseConnection } from "../src/database/databaseClient.js"
import { databasePath } from "../src/database/databasePath.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { openLibsql } from "../src/database/openLibsql.js"

export function databaseTestConnectionCreate(): DatabaseConnection {
  const openedDatabase = openLibsql(databasePath)
  return {
    client: openedDatabase.$client,
    db: drizzle(openedDatabase.$client, { schema: databaseSchema }),
  }
}
