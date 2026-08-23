import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { drizzle } from "drizzle-orm/libsql"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseConnection } from "./databaseClient.js"
import { databasePath } from "./databasePath.js"
import { databaseSchema } from "./databaseSchema.js"
import { openLibsql } from "./openLibsql.js"

export function databaseCreate(_configuration: RuntimeConfiguration): Result<DatabaseConnection> {
  const op = "databaseCreate"

  try {
    const untypedDatabase = openLibsql(databasePath)
    const db = drizzle(untypedDatabase.$client, { schema: databaseSchema })
    return createResult({ client: db.$client, db })
  } catch (_error) {
    return createResultError(op, "The database client could not be created.")
  }
}
