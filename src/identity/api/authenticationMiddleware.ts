import type { MiddlewareHandler } from "hono"
import type { Context } from "hono"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import type { RuntimeConfiguration } from "../../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { developmentIdentityUpsert } from "../db/developmentIdentityUpsert.js"
import { identitySessionLoad } from "../actions/identitySessionLoad.js"
import { identitySessionCookieRead } from "./identitySessionCookieRead.js"

type AuthenticationMiddlewareOptions = {
  developmentIdentityUpsert?: typeof developmentIdentityUpsert
  identitySessionLoad?: typeof identitySessionLoad
}

export function authenticationMiddleware(
  configuration: RuntimeConfiguration,
  database: DatabaseClient,
  options: AuthenticationMiddlewareOptions = {},
): MiddlewareHandler<AppEnvironment> {
  const mode = configuration.authMode ?? (configuration.nodeEnv === "development" ? "development" : "oidc")
  const developmentIdentityStore = options.developmentIdentityUpsert ?? developmentIdentityUpsert
  const sessionLoad = options.identitySessionLoad ?? identitySessionLoad

  return async (context, next) => {
    context.set("database", database)
    if (authenticationPathPublic(context.req.path, configuration)) return next()

    if (mode === "development") {
      const identity = configuration.developmentIdentity
      if (identity === undefined) return authenticationUnauthorized(context)

      const result = await databaseTransactionRun(database, (transaction) =>
        developmentIdentityStore(transaction, identity),
      )
      if (!result.success) return authenticationUnauthorized(context)

      context.set("requestIdentity", { displayName: result.data.displayName, userId: result.data.id })
      return next()
    }

    const token = identitySessionCookieRead(context)
    if (token === undefined) return authenticationUnauthorized(context)
    const session = await sessionLoad(database, token)
    if (!session.success || session.data === undefined) return authenticationUnauthorized(context)

    if (authenticationUnsafeRequest(context.req.method) && !authenticationOriginMatches(context, configuration)) {
      return authenticationForbidden(context)
    }

    context.set("requestIdentity", { sessionId: session.data.id, userId: session.data.userId })
    return next()
  }
}

function authenticationPathPublic(path: string, configuration: RuntimeConfiguration): boolean {
  if (path === "/api/health" || path === "/api/ready" || path === "/ready" || path === "/api/auth/login") return true
  const callbackPath =
    configuration.oidcCallbackUrl === undefined ? "/api/auth/callback" : new URL(configuration.oidcCallbackUrl).pathname
  return path === callbackPath
}

function authenticationUnsafeRequest(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS"
}

function authenticationOriginMatches(context: Context<AppEnvironment>, configuration: RuntimeConfiguration): boolean {
  if (configuration.publicOrigin === undefined) return false
  return context.req.header("Origin") === new URL(configuration.publicOrigin).origin
}

function authenticationUnauthorized(context: Context<AppEnvironment>) {
  const response = {
    error: {
      code: "unauthorized",
      message: "Authentication is required.",
    },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 401)
}

function authenticationForbidden(context: Context<AppEnvironment>) {
  const response = {
    error: {
      code: "forbidden",
      message: "The request origin is not allowed.",
    },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 403)
}
