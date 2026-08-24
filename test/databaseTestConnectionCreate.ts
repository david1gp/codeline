import type { DatabaseConnection } from "../src/database/databaseClient.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databasePath } from "../src/database/databasePath.js"

export function databaseTestConnectionCreate(): DatabaseConnection {
  return databaseConnectionCreate(databasePath)
}
