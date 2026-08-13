import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import { databaseSchema } from "./databaseSchema.js"
import type { DatabaseConnection } from "./databaseClient.js"

export function databaseCreate(configuration: RuntimeConfiguration): Result<DatabaseConnection> {
  const op = "databaseCreate"

  try {
    const client = postgres(configuration.databaseUrl)
    const db = drizzle(client, { schema: databaseSchema })
    return createResult({ client, db })
  } catch (_error) {
    return createResultError(op, "The database client could not be created.")
  }
}
