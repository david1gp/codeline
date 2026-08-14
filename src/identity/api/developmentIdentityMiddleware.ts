import type { MiddlewareHandler } from "hono"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { RuntimeConfiguration } from "../../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { developmentIdentityUpsert } from "../db/developmentIdentityUpsert.js"
import { authenticationMiddleware } from "./authenticationMiddleware.js"

export function developmentIdentityMiddleware(
  configuration: RuntimeConfiguration,
  database: DatabaseClient,
  userUpsert: typeof developmentIdentityUpsert = developmentIdentityUpsert,
): MiddlewareHandler<AppEnvironment> {
  return authenticationMiddleware(configuration, database, { developmentIdentityUpsert: userUpsert })
}
