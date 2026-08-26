import type { Context, MiddlewareHandler } from "hono"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import type { RuntimeConfiguration } from "../../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { identitySessionLoad } from "../actions/identitySessionLoad.js"
import { organizationMemberLoad } from "../actions/organizationMemberLoad.js"
import { developmentIdentityUpsert } from "../db/developmentIdentityUpsert.js"
import { oidcIssuerCanonicalize } from "../oidc/oidcIssuerCanonicalize.js"
import { identitySessionCookieRead } from "./identitySessionCookieRead.js"

const developmentIdentityIssuer = "urn:codeline:development"
const oidcProviderNames = ["authworks", "legacy", "zitadel"] as const

type OidcMembershipProviderConfiguration = {
  issuer: string
  organizationId: string
}

type AuthenticationMiddlewareOptions = {
  developmentIdentityUpsert?: typeof developmentIdentityUpsert
  now?: () => Date
  organizationMemberLoad?: typeof organizationMemberLoad
  identitySessionLoad?: typeof identitySessionLoad
}

export function authenticationMiddleware(
  configuration: RuntimeConfiguration,
  database: DatabaseClient,
  options: AuthenticationMiddlewareOptions = {},
): MiddlewareHandler<AppEnvironment> {
  const mode = configuration.authMode ?? (configuration.nodeEnv === "development" ? "development" : "oidc")
  const developmentIdentityStore = options.developmentIdentityUpsert ?? developmentIdentityUpsert
  const memberLoad = options.organizationMemberLoad ?? organizationMemberLoad
  const sessionLoad = options.identitySessionLoad ?? identitySessionLoad

  return async (context, next) => {
    context.set("database", database)
    if (authenticationPathPublic(context.req.path, configuration)) return next()

    if (mode === "development") {
      const identity = configuration.developmentIdentity
      const organizationExternalId = configuration.oidcOrganizationId
      if (identity === undefined || organizationExternalId === undefined) return authenticationUnauthorized(context)

      const result = await databaseTransactionRun(database, (transaction) =>
        developmentIdentityStore(transaction, identity),
      )
      if (!result.success) return authenticationUnauthorized(context)

      const membership = await memberLoad(database, result.data.id, organizationExternalId, developmentIdentityIssuer)
      if (!membership.success || membership.data === undefined) return authenticationUnauthorized(context)
      if (
        membership.data.organizationId === undefined ||
        membership.data.organizationId.length === 0 ||
        membership.data.issuer !== developmentIdentityIssuer ||
        membership.data.subject !== identity.identityKey ||
        membership.data.userId !== result.data.id
      )
        return authenticationUnauthorized(context)

      context.set("requestIdentity", {
        displayName: result.data.displayName,
        organizationId: membership.data.organizationId,
        userId: result.data.id,
      })
      return next()
    }

    const token = identitySessionCookieRead(context)
    if (token === undefined) return authenticationUnauthorized(context)
    const session = await sessionLoad(database, token, options.now?.() ?? new Date())
    if (!session.success || session.data === undefined) return authenticationUnauthorized(context)

    let organizationId: string | undefined
    const membershipProviders = oidcMembershipProvidersResolve(configuration)
    if (membershipProviders !== undefined) {
      for (const provider of membershipProviders) {
        const membership = await memberLoad(database, session.data.userId, provider.organizationId, provider.issuer)
        if (!membership.success) return authenticationUnauthorized(context)
        if (membership.data === undefined) continue
        organizationId = membership.data.organizationId
        break
      }
      if (organizationId === undefined) return authenticationUnauthorized(context)
    }

    if (authenticationUnsafeRequest(context.req.method) && !authenticationOriginMatches(context, configuration)) {
      return authenticationForbidden(context)
    }

    context.set("requestIdentity", {
      organizationId,
      sessionId: session.data.id,
      userId: session.data.userId,
    })
    return next()
  }
}

function oidcMembershipProvidersResolve(
  configuration: RuntimeConfiguration,
): readonly OidcMembershipProviderConfiguration[] | undefined {
  if (configuration.oidcProviders !== undefined) {
    return oidcProviderNames.flatMap((name) => {
      const provider = configuration.oidcProviders?.[name]
      if (provider?.issuer === undefined || provider.organizationId === undefined) return []
      const canonicalIssuer = oidcIssuerCanonicalize(provider.issuer)
      if (!canonicalIssuer.success) return []
      return [{ issuer: canonicalIssuer.data, organizationId: provider.organizationId }]
    })
  }

  if (configuration.oidcIssuer === undefined || configuration.oidcOrganizationId === undefined) return undefined
  const canonicalIssuer = oidcIssuerCanonicalize(configuration.oidcIssuer)
  if (!canonicalIssuer.success) return []
  return [{ issuer: canonicalIssuer.data, organizationId: configuration.oidcOrganizationId }]
}

function authenticationPathPublic(path: string, configuration: RuntimeConfiguration): boolean {
  if (
    path === "/api/health" ||
    path === "/api/ready" ||
    path === "/ready" ||
    path === "/api/auth/login" ||
    path === "/api/auth/providers"
  )
    return true
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
