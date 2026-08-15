import { createHash, randomBytes } from "node:crypto"
import type { Result } from "@adaptive-ds/result"
import type { Context } from "hono"
import { Hono } from "hono"
import * as oauth from "oauth4webapi"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { appKnownRouteResolve } from "../../app/appKnownRouteResolve.js"
import { oidcCallbackRequestUrlResolve } from "../../configuration/oidcCallbackRequestUrlResolve.js"
import type { RuntimeConfiguration } from "../../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient, DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { identitySessionCreate } from "../actions/identitySessionCreate.js"
import { identitySessionLoad } from "../actions/identitySessionLoad.js"
import { identitySessionRevoke } from "../actions/identitySessionRevoke.js"
import { oidcIdentityUpsert } from "../actions/oidcIdentityUpsert.js"
import { applicationUserRepositoryLoad } from "../db/applicationUserRepositoryLoad.js"
import { oidcLoginTransactionConsume } from "../db/oidcLoginTransactionConsume.js"
import { oidcLoginTransactionCreate } from "../db/oidcLoginTransactionCreate.js"
import { oidcLoginReturnToResolve } from "../oidc/oidcLoginReturnToResolve.js"
import { oidcProviderDiscoveryCreate } from "../oidc/oidcProviderDiscoveryCreate.js"
import type { OidcProviderFetch } from "../oidc/oidcProviderFetch.js"
import type { AuthLogoutResponse } from "./authLogoutResponseSchema.js"
import type { AuthSessionResponse } from "./authSessionResponseSchema.js"
import { identitySessionCookieClear } from "./identitySessionCookieClear.js"
import { identitySessionCookieRead } from "./identitySessionCookieRead.js"
import { identitySessionCookieSet } from "./identitySessionCookieSet.js"
import { oidcLoginBrowserBindingCookieClear } from "./oidcLoginBrowserBindingCookieClear.js"
import { oidcLoginBrowserBindingCookieRead } from "./oidcLoginBrowserBindingCookieRead.js"
import { oidcLoginBrowserBindingCookieSet } from "./oidcLoginBrowserBindingCookieSet.js"

type ApiAuthRoutesOptions = {
  configuration?: RuntimeConfiguration
  database?: DatabaseClient
  idCreate?: () => string
  identitySessionRevoke?: typeof identitySessionRevoke
  identitySessionCreate?: typeof identitySessionCreate
  identitySessionLoad?: typeof identitySessionLoad
  oidcIdentityUpsert?: typeof oidcIdentityUpsert
  now?: () => Date
  oidcLoginTransactionCreate?: typeof oidcLoginTransactionCreate
  oidcLoginTransactionConsume?: typeof oidcLoginTransactionConsume
  oidcProviderDiscovery?: ReturnType<typeof oidcProviderDiscoveryCreate>
  oidcProviderFetch?: OidcProviderFetch
  oidcSessionCredentialCreate?: () => string
  oidcSessionIdCreate?: () => string
  randomValueCreate?: () => string
  returnToPathIsKnown?: typeof appKnownRouteResolve
  callbackRoute?: Hono<AppEnvironment>
}

export function apiAuthRoutesAdd(api: Hono<AppEnvironment>, options: ApiAuthRoutesOptions = {}): void {
  const revoke = options.identitySessionRevoke ?? identitySessionRevoke
  const transactionCreate = options.oidcLoginTransactionCreate ?? oidcLoginTransactionCreate
  const providerDiscovery =
    options.oidcProviderDiscovery ??
    oidcProviderDiscoveryCreate({
      ...(options.oidcProviderFetch === undefined ? {} : { fetch: options.oidcProviderFetch }),
      ...(options.now === undefined ? {} : { now: options.now }),
    })
  const idCreate = options.idCreate ?? uuidv7
  const randomValueCreate = options.randomValueCreate ?? (() => randomBytes(32).toString("base64url"))
  const pathIsKnown = options.returnToPathIsKnown ?? appKnownRouteResolve
  const callbackRoute = options.callbackRoute ?? api
  const callbackPath = oidcCallbackPathResolve(options.configuration)
  const callbackRoutePath = options.callbackRoute === undefined ? oidcApiPathResolve(callbackPath) : callbackPath

  api.get("/auth/login", async (context) => {
    context.header("Cache-Control", "no-store")

    const configuration = options.configuration
    if (configuration === undefined || authenticationModeResolve(configuration) !== "oidc") {
      return oidcLoginError(context, 404, "OIDC login is not enabled.")
    }
    if (
      configuration.oidcIssuer === undefined ||
      configuration.publicOrigin === undefined ||
      configuration.oidcClientId === undefined
    ) {
      return oidcLoginError(context, 503, "OIDC login is not configured.")
    }

    const returnTo = oidcLoginReturnToResolve(context.req.query("returnTo"), configuration.publicOrigin, pathIsKnown)
    if (!returnTo.success) return oidcLoginError(context, 400, "The login return path is invalid.")

    const provider = await providerDiscovery(configuration.oidcIssuer)
    if (!provider.success) return oidcLoginError(context, 503, "The OIDC provider is unavailable.")

    const now = options.now?.() ?? new Date()
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1_000)
    const state = randomValueCreate()
    const nonce = randomValueCreate()
    const codeVerifier = randomValueCreate()
    const browserBinding = randomValueCreate()
    let codeChallenge: string
    try {
      codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier)
    } catch (_error) {
      return oidcLoginError(context, 500, "The OIDC login transaction could not be created.")
    }

    const redirectUri =
      configuration.oidcCallbackUrl ?? new URL("/api/auth/callback", configuration.publicOrigin).toString()
    const database = options.database ?? context.var.database
    const storedTransaction = await transactionCreate(database ?? ({} as DatabaseClient), {
      browserBinding,
      codeVerifier,
      expiresAt,
      id: idCreate(),
      issuer: configuration.oidcIssuer,
      nonce,
      redirectUri,
      returnTo: returnTo.data,
      state,
    })
    if (!storedTransaction.success)
      return oidcLoginError(context, 500, "The OIDC login transaction could not be created.")

    const authorizationUrl = new URL(provider.data.authorizationEndpoint)
    authorizationUrl.searchParams.set("client_id", configuration.oidcClientId)
    authorizationUrl.searchParams.set("code_challenge", codeChallenge)
    authorizationUrl.searchParams.set("code_challenge_method", "S256")
    authorizationUrl.searchParams.set("redirect_uri", redirectUri)
    authorizationUrl.searchParams.set("response_type", "code")
    authorizationUrl.searchParams.set("scope", "openid profile email")
    authorizationUrl.searchParams.set("state", state)
    authorizationUrl.searchParams.set("nonce", nonce)

    oidcLoginBrowserBindingCookieSet(context, browserBinding, expiresAt, now)
    return context.redirect(authorizationUrl.toString(), 302)
  })

  callbackRoute.get(callbackRoutePath, async (context) => {
    oidcCallbackHeadersSet(context)
    try {
      return await oidcCallbackHandle(context, {
        configuration: options.configuration,
        database: options.database,
        identitySessionCreate: options.identitySessionCreate,
        identitySessionLoad: options.identitySessionLoad,
        identitySessionRevoke: options.identitySessionRevoke,
        idCreate,
        identityUpsert: options.oidcIdentityUpsert,
        now: options.now,
        providerDiscovery,
        providerFetch: options.oidcProviderFetch,
        sessionCredentialCreate: options.oidcSessionCredentialCreate,
        sessionIdCreate: options.oidcSessionIdCreate,
        transactionConsume: options.oidcLoginTransactionConsume,
        pathIsKnown,
      })
    } catch (_error) {
      return oidcCallbackError(context, 500)
    }
  })

  api.get("/auth/session", async (context) => {
    const identity = context.var.requestIdentity
    if (identity === undefined) return authenticationUnauthorized(context)
    const storedUser =
      identity.displayName === undefined
        ? await applicationUserRepositoryLoad(context.var.database, identity.userId)
        : undefined
    const displayName = identity.displayName ?? (storedUser?.success ? storedUser.data?.displayName : undefined)
    if (displayName === undefined) return authenticationUnauthorized(context)
    const response = {
      authenticated: true,
      displayName,
      userId: identity.userId,
    } satisfies AuthSessionResponse
    context.header("Cache-Control", "no-store")
    return context.json(response)
  })

  api.post("/auth/logout", async (context) => {
    const identity = context.var.requestIdentity
    if (identity === undefined) return authenticationUnauthorized(context)
    const sessionId = identity.sessionId
    if (sessionId !== undefined) {
      const result = await revoke(context.var.database, sessionId, options.now?.() ?? new Date())
      if (!result.success) {
        const response = {
          error: { code: "internal_server_error", message: "The session could not be revoked." },
        } satisfies ApiErrorResponse
        return context.json(response, 500)
      }
    }

    identitySessionCookieClear(context)
    const response = { loggedOut: true } satisfies AuthLogoutResponse
    context.header("Cache-Control", "no-store")
    return context.json(response)
  })
}

function authenticationModeResolve(configuration: RuntimeConfiguration): "development" | "oidc" {
  return configuration.authMode ?? (configuration.nodeEnv === "development" ? "development" : "oidc")
}

function oidcLoginError(context: Context<AppEnvironment>, status: 400 | 404 | 500 | 503, message: string) {
  const response = {
    error: {
      code: status === 400 ? "bad_request" : status === 404 ? "not_found" : "internal_server_error",
      message,
    },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, status)
}

function authenticationUnauthorized(context: Context<AppEnvironment>) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 401)
}

type OidcCallbackHandleOptions = {
  configuration?: RuntimeConfiguration
  database?: DatabaseClient
  identitySessionCreate?: typeof identitySessionCreate
  identitySessionLoad?: typeof identitySessionLoad
  identitySessionRevoke?: typeof identitySessionRevoke
  idCreate: () => string
  identityUpsert?: typeof oidcIdentityUpsert
  now?: () => Date
  pathIsKnown: typeof appKnownRouteResolve
  providerDiscovery: ReturnType<typeof oidcProviderDiscoveryCreate>
  providerFetch?: OidcProviderFetch
  sessionCredentialCreate?: () => string
  sessionIdCreate?: () => string
  transactionConsume?: typeof oidcLoginTransactionConsume
}

async function oidcCallbackHandle(
  context: Context<AppEnvironment>,
  options: OidcCallbackHandleOptions,
): Promise<Response> {
  const configuration = options.configuration
  if (configuration === undefined || authenticationModeResolve(configuration) !== "oidc") {
    return oidcCallbackError(context, 404)
  }
  if (
    configuration.oidcIssuer === undefined ||
    configuration.publicOrigin === undefined ||
    configuration.oidcClientId === undefined
  ) {
    return oidcCallbackError(context, 503)
  }

  const callbackUri = oidcCallbackUriResolve(configuration)
  const requestUrl = new URL(context.req.url)
  const configuredCallback = new URL(callbackUri)
  const callbackRequestUrl = oidcCallbackRequestUrlResolve(configuredCallback, requestUrl)
  if (callbackRequestUrl.pathname !== configuredCallback.pathname) {
    return oidcCallbackError(context, 400)
  }

  const callbackParameters = callbackRequestUrl.searchParams
  const states = callbackParameters.getAll("state")
  const state = states[0]
  if (states.length !== 1 || state === undefined || state.length === 0) return oidcCallbackError(context, 400)

  const browserBinding = oidcLoginBrowserBindingCookieRead(context)
  if (browserBinding === undefined || browserBinding.length === 0) return oidcCallbackError(context, 400)

  const database = options.database ?? context.var.database
  if (database === undefined) return oidcCallbackError(context, 503)
  const now = options.now?.() ?? new Date()
  const transactionConsume = options.transactionConsume ?? oidcLoginTransactionConsume
  const consumedTransaction = await transactionConsume(database, state, now, browserBinding)
  if (!consumedTransaction.success) return oidcCallbackError(context, 500)
  const transaction = consumedTransaction.data
  if (
    transaction === undefined ||
    transaction.issuer !== configuration.oidcIssuer ||
    transaction.redirectUri !== callbackUri ||
    transaction.expiresAt.getTime() <= now.getTime()
  ) {
    return oidcCallbackError(context, 400)
  }

  const returnTo = oidcLoginReturnToResolve(transaction.returnTo, configuration.publicOrigin, options.pathIsKnown)
  if (!returnTo.success) return oidcCallbackError(context, 400)

  const provider = await options.providerDiscovery(configuration.oidcIssuer)
  if (!provider.success) return oidcCallbackError(context, 503)
  if (provider.data.issuer !== configuration.oidcIssuer) return oidcCallbackError(context, 503)

  const clientAuthentication = oidcClientAuthenticationResolve(
    provider.data.tokenEndpointAuthMethodsSupported,
    configuration,
  )
  if (clientAuthentication === undefined) return oidcCallbackError(context, 503)

  const authorizationServer: oauth.AuthorizationServer = {
    authorization_response_iss_parameter_supported: provider.data.authorizationResponseIssParameterSupported,
    id_token_signing_alg_values_supported: [...provider.data.idTokenSigningAlgValuesSupported],
    issuer: provider.data.issuer,
    jwks_uri: provider.data.jwksUri,
    token_endpoint: provider.data.tokenEndpoint,
  }
  const client: oauth.Client = {
    client_id: configuration.oidcClientId,
    [oauth.clockSkew]: (now.getTime() - Date.now()) / 1_000,
    [oauth.clockTolerance]: oidcClockToleranceSeconds,
  }

  let claims: oauth.IDToken | undefined
  try {
    const validatedParameters = await oauth.validateAuthResponse(authorizationServer, client, callbackParameters, state)
    const tokenResponse = await oauth.authorizationCodeGrantRequest(
      authorizationServer,
      client,
      clientAuthentication,
      validatedParameters,
      transaction.redirectUri,
      transaction.codeVerifier,
      { [oauth.customFetch]: oidcProviderCustomFetch(options.providerFetch) },
    )
    const nonce = await oidcResponseNonceResolve(tokenResponse)
    if (nonce === undefined) return oidcCallbackError(context, 400)
    const processedTokenResponse = await oauth.processAuthorizationCodeResponse(
      authorizationServer,
      client,
      tokenResponse,
      {
        expectedNonce: nonce,
        requireIdToken: true,
      },
    )
    await oidcIdTokenSignatureValidate(authorizationServer, tokenResponse, options.providerFetch)
    claims = oauth.getValidatedIdTokenClaims(processedTokenResponse)
  } catch (_error) {
    return oidcCallbackError(context, 400)
  }
  if (claims === undefined) return oidcCallbackError(context, 400)
  if (
    !oidcIdTokenClaimsAreSafe(claims, provider.data.issuer, configuration.oidcClientId, now) ||
    createHash("sha256")
      .update(claims.nonce ?? "")
      .digest("hex") !== transaction.nonceHash
  ) {
    return oidcCallbackError(context, 400)
  }

  const identityUpsert = options.identityUpsert ?? oidcIdentityUpsert
  const identitySessionLoadResolve = options.identitySessionLoad ?? identitySessionLoad
  const identitySessionRevokeResolve = options.identitySessionRevoke ?? identitySessionRevoke
  const identitySessionCreateResolve = options.identitySessionCreate ?? identitySessionCreate
  const presentedSessionToken = identitySessionCookieRead(context)
  const persisted = await oidcDatabaseTransactionRun(database, async (executor) => {
    const user = await identityUpsert(executor, {
      displayName: oidcProfileStringResolve(claims.name) ?? oidcProfileStringResolve(claims.preferred_username),
      issuer: provider.data.issuer,
      subject: claims.sub,
      ...(claims.email_verified === true && oidcProfileStringResolve(claims.email) !== undefined
        ? { verifiedEmail: oidcProfileStringResolve(claims.email) }
        : {}),
    })
    if (!user.success) return user

    if (presentedSessionToken !== undefined) {
      const presentedSession = await identitySessionLoadResolve(executor, presentedSessionToken, now)
      if (!presentedSession.success) return presentedSession
      if (presentedSession.data !== undefined) {
        const revokedSession = await identitySessionRevokeResolve(executor, presentedSession.data.id, now)
        if (!revokedSession.success) return revokedSession
      }
    }

    const session = await identitySessionCreateResolve(executor, user.data.id, {
      ...(options.sessionCredentialCreate === undefined ? {} : { credentialCreate: options.sessionCredentialCreate }),
      ...(options.sessionIdCreate === undefined ? {} : { idCreate: options.sessionIdCreate }),
      now,
    })
    if (!session.success) return session
    return {
      success: true as const,
      data: { session: session.data.session, token: session.data.token },
    }
  })
  if (!persisted.success) return oidcCallbackError(context, 500)

  oidcLoginBrowserBindingCookieClear(context)
  identitySessionCookieSet(context, persisted.data.token, persisted.data.session.expiresAt, now)
  return context.redirect(returnTo.data, 302)
}

const oidcClockToleranceSeconds = 30

function oidcCallbackPathResolve(configuration: RuntimeConfiguration | undefined): string {
  if (configuration?.oidcCallbackUrl !== undefined) return new URL(configuration.oidcCallbackUrl).pathname
  if (configuration?.publicOrigin !== undefined)
    return new URL("/api/auth/callback", configuration.publicOrigin).pathname
  return "/api/auth/callback"
}

function oidcCallbackUriResolve(configuration: RuntimeConfiguration): string {
  return configuration.oidcCallbackUrl ?? new URL("/api/auth/callback", configuration.publicOrigin).toString()
}

function oidcApiPathResolve(path: string): string {
  return path.startsWith("/api/") ? path.slice("/api".length) : path
}

function oidcCallbackHeadersSet(context: Context<AppEnvironment>): void {
  context.header("Cache-Control", "no-store")
  context.header("Referrer-Policy", "no-referrer")
}

function oidcCallbackError(context: Context<AppEnvironment>, status: 400 | 404 | 500 | 503): Response {
  oidcLoginBrowserBindingCookieClear(context)
  const response = {
    error: {
      code: status === 400 ? "bad_request" : status === 404 ? "not_found" : "internal_server_error",
      message: "The OIDC login could not be completed.",
    },
  } satisfies ApiErrorResponse
  oidcCallbackHeadersSet(context)
  return context.json(response, status)
}

function oidcClientAuthenticationResolve(
  supportedMethods: readonly string[] | undefined,
  configuration: RuntimeConfiguration,
): oauth.ClientAuth | undefined {
  const methods = new Set((supportedMethods ?? ["client_secret_basic"]).map((method) => method.toLowerCase()))
  const secret = configuration.oidcClientSecret
  if (secret !== undefined && methods.has("client_secret_basic")) return oauth.ClientSecretBasic(secret)
  if (secret !== undefined && methods.has("client_secret_post")) return oauth.ClientSecretPost(secret)
  if (secret !== undefined && methods.has("client_secret_jwt")) return oauth.ClientSecretJwt(secret)
  if (secret === undefined && methods.has("none")) return oauth.None()
  return undefined
}

type OidcProviderCustomFetch = (
  url: string,
  request: {
    body: URLSearchParams | undefined
    headers: Record<string, string>
    method: "GET" | "POST"
    redirect: "manual"
    signal?: AbortSignal
  },
) => Promise<Response>

function oidcProviderCustomFetch(fetcher: OidcProviderFetch | undefined): OidcProviderCustomFetch {
  const providerFetch = fetcher ?? globalThis.fetch
  return (url, request) =>
    providerFetch(url, {
      body: request.body,
      headers: request.headers,
      method: request.method,
      redirect: request.redirect,
      signal: request.signal,
    })
}

async function oidcIdTokenSignatureValidate(
  authorizationServer: oauth.AuthorizationServer,
  tokenResponse: Response,
  providerFetch: OidcProviderFetch | undefined,
): Promise<void> {
  try {
    await oauth.validateApplicationLevelSignature(authorizationServer, tokenResponse, {
      [oauth.customFetch]: oidcProviderCustomFetch(providerFetch),
    })
    return
  } catch (_error) {
    const rotatedAuthorizationServer = { ...authorizationServer }
    await oauth.validateApplicationLevelSignature(rotatedAuthorizationServer, tokenResponse, {
      [oauth.customFetch]: oidcProviderCustomFetch(providerFetch),
    })
  }
}

async function oidcResponseNonceResolve(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { id_token?: unknown }
    return oidcUnverifiedNonceResolve(typeof body.id_token === "string" ? body.id_token : undefined)
  } catch (_error) {
    return undefined
  }
}

function oidcUnverifiedNonceResolve(idToken: string | undefined): string | undefined {
  if (idToken === undefined) return undefined
  const payload = idToken.split(".")[1]
  if (payload === undefined) return undefined
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { nonce?: unknown }
    return typeof claims.nonce === "string" && claims.nonce.length > 0 ? claims.nonce : undefined
  } catch (_error) {
    return undefined
  }
}

function oidcIdTokenClaimsAreSafe(claims: oauth.IDToken, issuer: string, clientId: string, now: Date): boolean {
  if (claims.iss !== issuer || typeof claims.sub !== "string" || claims.sub.trim().length === 0) return false
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audience.includes(clientId)) return false
  if (audience.length > 1 && claims.azp !== clientId) return false
  if (!Number.isFinite(claims.exp) || !Number.isFinite(claims.iat)) return false
  const nowSeconds = now.getTime() / 1_000
  if (claims.exp <= nowSeconds - oidcClockToleranceSeconds) return false
  if (claims.iat > nowSeconds + oidcClockToleranceSeconds || claims.iat > claims.exp) return false
  return true
}

function oidcProfileStringResolve(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

async function oidcDatabaseTransactionRun<T>(
  database: DatabaseClient,
  operation: (executor: DatabaseExecutor) => Promise<Result<T>>,
): Promise<Result<T>> {
  if (typeof database.transaction === "function") return databaseTransactionRun(database, operation)
  return operation(database)
}
