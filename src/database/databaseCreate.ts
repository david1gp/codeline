import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseConnection } from "./databaseClient.js"
import { databaseConnectionCreate } from "./databaseConnectionCreate.js"
import { databaseFilePathResolve } from "./databaseFilePathResolve.js"
import { databasePath } from "./databasePath.js"

export function databaseCreate(
  _configuration: RuntimeConfiguration,
  injectedPath?: string,
): Result<DatabaseConnection> {
  const op = "databaseCreate"
  const filePath = injectedPath === undefined ? createResult(databasePath) : databaseFilePathResolve(injectedPath)
  if (!filePath.success) return filePath

  try {
    return createResult(databaseConnectionCreate(filePath.data))
  } catch (_error) {
    return createResultError(op, "The database client could not be created.")
  }
}
