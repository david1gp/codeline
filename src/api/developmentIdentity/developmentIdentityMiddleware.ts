import type { MiddlewareHandler } from "hono"
import type { AppEnvironment } from "../appEnvironment.js"
import type { RuntimeConfiguration } from "../../configuration/runtimeConfigurationSchema.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { developmentUserUpsert } from "../../database/repository/developmentUserUpsert.js"
import type { ApiErrorResponse } from "../errors/apiErrorResponseSchema.js"

export function developmentIdentityMiddleware(
  configuration: RuntimeConfiguration,
  database: DatabaseClient,
  userUpsert: typeof developmentUserUpsert = developmentUserUpsert,
): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    const identity = configuration.developmentIdentity
    if (
      context.req.path === "/api/ready" ||
      context.req.path === "/ready" ||
      configuration.nodeEnv !== "development" ||
      identity === undefined
    )
      return next()

    const result = await databaseTransactionRun(database, (transaction) => userUpsert(transaction, identity))
    if (!result.success) {
      const response = {
        error: {
          code: "development_identity_unavailable",
          message: "The development identity is unavailable.",
        },
      } satisfies ApiErrorResponse
      context.status(503)
      return context.json(response)
    }

    context.set("database", database)
    context.set("developmentUser", result.data)
    return next()
  }
}
