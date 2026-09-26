import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseConnection } from "./databaseClient.js"
import { databaseConnectionCreate } from "./databaseConnectionCreate.js"
import { databasePath } from "./databasePath.js"

export function databaseCreate(_configuration: RuntimeConfiguration): Result<DatabaseConnection> {
  const op = "databaseCreate"

  try {
    return createResult(databaseConnectionCreate(databasePath))
  } catch (_error) {
    return createResultError(op, "The database client could not be created.")
  }
}
