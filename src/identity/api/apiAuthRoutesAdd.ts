import { createHash, randomBytes } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
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
import { oidcResourceOwnerClaim } from "../oidc/oidcResourceOwnerClaim.js"
import { oidcResourceOwnerScope } from "../oidc/oidcResourceOwnerScope.js"
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

type OidcTokenExchangeFailureStage =
  | "token_exchange_invalid_request"
  | "token_exchange_invalid_client"
  | "token_exchange_invalid_grant"
  | "token_exchange_invalid_scope"
  | "token_exchange_unsupported_grant_type"
  | "token_exchange_server_error"
  | "token_exchange_unknown"

type OidcCallbackStage =
  | "configuration"
  | "callback_path"
  | "state"
  | "browser_binding"
  | "database"
  | "transaction_consume"
  | "transaction_validate"
  | "return_to"
  | "provider_discovery"
  | "client_authentication"
  | "authorization_response"
  | "token_exchange"
  | OidcTokenExchangeFailureStage
  | "token_response_json"
  | "token_response_id_token_missing"
  | "token_response_id_token_type"
  | "id_token_jwt_payload_missing"
  | "id_token_payload_json"
  | "id_token_nonce_missing"
  | "id_token_nonce_empty"
  | "id_token_nonce_type"
  | "nonce_mismatch"
  | "id_token_parse"
  | "id_token_signature"
  | "id_token_claims"
  | "userinfo"
  | "subject_consistency"
  | "resource_owner_validation"
  | "identity_session_persistence"
  | "unexpected"

export function apiAuthRoutesAdd(api: Hono<AppEnvironment>, options: ApiAuthRoutesOptions = {}): void {
  const revoke = options.identitySessionRevoke ?? identitySessionRevoke
  const transactionCreate = options.oidcLoginTransactionCreate ?? oidcLoginTransactionCreate
  const transactionConsume = options.oidcLoginTransactionConsume ?? oidcLoginTransactionConsume
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
      configuration.oidcClientId === undefined ||
      configuration.oidcOrganizationId === undefined
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
    const authorizationScopes = ["openid", "profile", "email"]
    if (provider.data.scopesSupported?.includes(oidcResourceOwnerScope))
      authorizationScopes.push(oidcResourceOwnerScope)
    authorizationUrl.searchParams.set("scope", authorizationScopes.join(" "))
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
        transactionConsume,
        pathIsKnown,
      })
    } catch (_error) {
      return oidcCallbackFailure(context, 500, "unexpected")
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
    const sessionToken = await authSessionTokenResolve(context, identity.userId, options)
    if (!sessionToken.success) return authenticationUnauthorized(context)
    const response = {
      authenticated: true,
      displayName,
      ...(sessionToken.data === undefined ? {} : { token: sessionToken.data }),
      ...(identity.organizationId === undefined ? {} : { organizationId: identity.organizationId }),
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

async function authSessionTokenResolve(
  context: Context<AppEnvironment>,
  userId: string,
  options: ApiAuthRoutesOptions,
): Promise<Result<string | undefined>> {
  const existing = identitySessionCookieRead(context)
  const isDevelopment =
    options.configuration !== undefined && authenticationModeResolve(options.configuration) === "development"
  if (!isDevelopment) return createResult(existing)

  const database = options.database ?? context.var.database
  if (existing !== undefined) {
    const loaded = await (options.identitySessionLoad ?? identitySessionLoad)(
      database ?? ({} as DatabaseClient),
      existing,
    )
    if (!loaded.success) return createResultError("authSessionTokenResolve", loaded.errorMessage)
    if (loaded.data?.userId === userId) return createResult(existing)
  }

  const created = await (options.identitySessionCreate ?? identitySessionCreate)(
    database ?? ({} as DatabaseClient),
    userId,
  )
  if (!created.success) return created
  identitySessionCookieSet(context, created.data.token, created.data.session.expiresAt, options.now?.() ?? new Date())
  return createResult(created.data.token)
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
    return oidcCallbackFailure(context, 404, "configuration")
  }
  if (
    configuration.oidcIssuer === undefined ||
    configuration.publicOrigin === undefined ||
    configuration.oidcClientId === undefined ||
    configuration.oidcOrganizationId === undefined
  ) {
    return oidcCallbackFailure(context, 503, "configuration")
  }

  const callbackUri = oidcCallbackUriResolve(configuration)
  const requestUrl = new URL(context.req.url)
  const configuredCallback = new URL(callbackUri)
  const callbackRequestUrl = oidcCallbackRequestUrlResolve(configuredCallback, requestUrl)
  if (callbackRequestUrl.pathname !== configuredCallback.pathname) {
    return oidcCallbackFailure(context, 400, "callback_path")
  }

  const callbackParameters = callbackRequestUrl.searchParams
  const states = callbackParameters.getAll("state")
  const state = states[0]
  if (states.length !== 1 || state === undefined || state.length === 0)
    return oidcCallbackFailure(context, 400, "state")

  const browserBinding = oidcLoginBrowserBindingCookieRead(context)
  if (browserBinding === undefined || browserBinding.length === 0)
    return oidcCallbackFailure(context, 400, "browser_binding")

  const database = options.database ?? context.var.database
  if (database === undefined) return oidcCallbackFailure(context, 503, "database")
  const now = options.now?.() ?? new Date()
  const transactionConsume = options.transactionConsume ?? oidcLoginTransactionConsume
  const consumedTransaction = await transactionConsume(database, state, now, browserBinding)
  if (!consumedTransaction.success) return oidcCallbackFailure(context, 500, "transaction_consume")
  const transaction = consumedTransaction.data
  if (
    transaction === undefined ||
    transaction.issuer !== configuration.oidcIssuer ||
    transaction.redirectUri !== callbackUri ||
    transaction.expiresAt.getTime() <= now.getTime()
  ) {
    return oidcCallbackFailure(context, 400, "transaction_validate")
  }

  const returnTo = oidcLoginReturnToResolve(transaction.returnTo, configuration.publicOrigin, options.pathIsKnown)
  if (!returnTo.success) return oidcCallbackFailure(context, 400, "return_to")

  const provider = await options.providerDiscovery(configuration.oidcIssuer)
  if (!provider.success) return oidcCallbackFailure(context, 503, "provider_discovery")
  if (provider.data.issuer !== configuration.oidcIssuer) return oidcCallbackFailure(context, 503, "provider_discovery")

  const clientAuthentication = oidcClientAuthenticationResolve(
    provider.data.tokenEndpointAuthMethodsSupported,
    configuration,
  )
  if (clientAuthentication === undefined) return oidcCallbackFailure(context, 503, "client_authentication")

  const authorizationServer: oauth.AuthorizationServer = {
    authorization_response_iss_parameter_supported: provider.data.authorizationResponseIssParameterSupported,
    id_token_signing_alg_values_supported: [...provider.data.idTokenSigningAlgValuesSupported],
    issuer: provider.data.issuer,
    jwks_uri: provider.data.jwksUri,
    token_endpoint: provider.data.tokenEndpoint,
    ...(provider.data.userinfoEndpoint === undefined ? {} : { userinfo_endpoint: provider.data.userinfoEndpoint }),
  }
  const client: oauth.Client = {
    client_id: configuration.oidcClientId,
    [oauth.clockSkew]: (now.getTime() - Date.now()) / 1_000,
    [oauth.clockTolerance]: oidcClockToleranceSeconds,
  }

  let claims: oauth.IDToken | undefined
  let processedTokenResponse: oauth.TokenEndpointResponse | undefined
  let validatedParameters: Parameters<typeof oauth.authorizationCodeGrantRequest>[3]
  try {
    validatedParameters = await oauth.validateAuthResponse(authorizationServer, client, callbackParameters, state)
  } catch (_error) {
    return oidcCallbackFailure(context, 400, "authorization_response")
  }
  let tokenResponse: Response
  try {
    tokenResponse = await oauth.authorizationCodeGrantRequest(
      authorizationServer,
      client,
      clientAuthentication,
      validatedParameters,
      transaction.redirectUri,
      transaction.codeVerifier,
      { [oauth.customFetch]: oidcProviderCustomFetch(options.providerFetch) },
    )
  } catch (_error) {
    return oidcCallbackFailure(context, 400, "token_exchange")
  }
  if (!tokenResponse.ok)
    return oidcCallbackFailure(context, 400, await oidcTokenExchangeFailureStageResolve(tokenResponse))
  const nonceResult = await oidcResponseNonceResolve(tokenResponse)
  if (nonceResult.category !== "success") return oidcCallbackFailure(context, 400, nonceResult.category)
  const nonce = nonceResult.nonce
  try {
    processedTokenResponse = await oauth.processAuthorizationCodeResponse(authorizationServer, client, tokenResponse, {
      expectedNonce: nonce,
      requireIdToken: true,
    })
  } catch (_error) {
    if (createHash("sha256").update(nonce).digest("hex") !== transaction.nonceHash)
      return oidcCallbackFailure(context, 400, "nonce_mismatch")
    return oidcCallbackFailure(context, 400, "id_token_parse")
  }
  try {
    await oidcIdTokenSignatureValidate(authorizationServer, tokenResponse, options.providerFetch)
  } catch (_error) {
    return oidcCallbackFailure(context, 400, "id_token_signature")
  }
  try {
    claims = oauth.getValidatedIdTokenClaims(processedTokenResponse)
  } catch (_error) {
    return oidcCallbackFailure(context, 400, "id_token_claims")
  }
  if (claims === undefined) return oidcCallbackFailure(context, 400, "id_token_claims")
  if (!oidcIdTokenClaimsAreSafe(claims, provider.data.issuer, configuration.oidcClientId, now))
    return oidcCallbackFailure(context, 400, "id_token_claims")
  if (
    createHash("sha256")
      .update(claims.nonce ?? "")
      .digest("hex") !== transaction.nonceHash
  )
    return oidcCallbackFailure(
      context,
      400,
      typeof claims.nonce === "string" && claims.nonce.length > 0 ? "nonce_mismatch" : "id_token_nonce_missing",
    )

  const resourceOwnerId = await oidcResourceOwnerIdResolve(
    authorizationServer,
    client,
    claims,
    processedTokenResponse,
    options.providerFetch,
  )
  if (!resourceOwnerId.success)
    return oidcCallbackFailure(context, 400, resourceOwnerId.callbackStage ?? "resource_owner_validation")
  if (resourceOwnerId.data !== configuration.oidcOrganizationId)
    return oidcCallbackFailure(context, 400, "resource_owner_validation")

  const identityUpsert = options.identityUpsert ?? oidcIdentityUpsert
  const identitySessionLoadResolve = options.identitySessionLoad ?? identitySessionLoad
  const identitySessionRevokeResolve = options.identitySessionRevoke ?? identitySessionRevoke
  const identitySessionCreateResolve = options.identitySessionCreate ?? identitySessionCreate
  const presentedSessionToken = identitySessionCookieRead(context)
  let persisted: Result<{ session: { expiresAt: Date }; token: string }>
  try {
    persisted = await oidcDatabaseTransactionRun(database, async (executor) => {
      const user = await identityUpsert(executor, {
        displayName: oidcProfileStringResolve(claims.name) ?? oidcProfileStringResolve(claims.preferred_username),
        issuer: provider.data.issuer,
        organizationExternalId: resourceOwnerId.data,
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
  } catch (_error) {
    return oidcCallbackFailure(context, 500, "identity_session_persistence")
  }
  if (!persisted.success) return oidcCallbackFailure(context, 500, "identity_session_persistence")

  oidcLoginBrowserBindingCookieClear(context)
  identitySessionCookieSet(context, persisted.data.token, persisted.data.session.expiresAt, now)
  return context.redirect(returnTo.data, 302)
}

const oidcClockToleranceSeconds = 30
const oidcTokenExchangeResponseMaxBytes = 16 * 1024

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

function oidcCallbackFailure(
  context: Context<AppEnvironment>,
  status: 400 | 404 | 500 | 503,
  stage: OidcCallbackStage,
): Response {
  oidcCallbackStageLog(stage)
  return oidcCallbackError(context, status)
}

function oidcCallbackStageLog(stage: OidcCallbackStage): void {
  try {
    console.log(`auth_callback_stage=${stage}`)
  } catch (_error) {
    // Diagnostics must never change the callback response.
  }
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

async function oidcTokenExchangeFailureStageResolve(response: Response): Promise<OidcTokenExchangeFailureStage> {
  const body = await oidcBoundedResponseJsonResolve(response)
  if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body))
    return "token_exchange_unknown"

  const error = (body as Record<string, unknown>).error
  if (typeof error !== "string") return "token_exchange_unknown"
  if (error === "invalid_request") return "token_exchange_invalid_request"
  if (error === "invalid_client") return "token_exchange_invalid_client"
  if (error === "invalid_grant") return "token_exchange_invalid_grant"
  if (error === "invalid_scope") return "token_exchange_invalid_scope"
  if (error === "unsupported_grant_type") return "token_exchange_unsupported_grant_type"
  if (error === "server_error") return "token_exchange_server_error"
  return "token_exchange_unknown"
}

async function oidcBoundedResponseJsonResolve(response: Response): Promise<unknown | undefined> {
  let clonedResponse: Response
  try {
    clonedResponse = response.clone()
  } catch (_error) {
    return undefined
  }
  const body = await oidcBoundedResponseTextResolve(clonedResponse)
  if (body === undefined) return undefined
  try {
    return JSON.parse(body) as unknown
  } catch (_error) {
    return undefined
  }
}

async function oidcBoundedResponseTextResolve(response: Response): Promise<string | undefined> {
  try {
    if (response.body === null) {
      const body = new Uint8Array(await response.arrayBuffer())
      if (body.byteLength > oidcTokenExchangeResponseMaxBytes) return undefined
      return new TextDecoder("utf-8", { fatal: true }).decode(body)
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let byteLength = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        byteLength += chunk.value.byteLength
        if (byteLength > oidcTokenExchangeResponseMaxBytes) {
          await reader.cancel()
          return undefined
        }
        chunks.push(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }

    const body = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(body)
  } catch (_error) {
    return undefined
  }
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

type OidcNonceExtractionFailureCategory =
  | "token_response_json"
  | "token_response_id_token_missing"
  | "token_response_id_token_type"
  | "id_token_jwt_payload_missing"
  | "id_token_payload_json"
  | "id_token_nonce_missing"
  | "id_token_nonce_empty"
  | "id_token_nonce_type"

type OidcNonceExtractionResult =
  | { category: "success"; nonce: string }
  | { category: OidcNonceExtractionFailureCategory }

async function oidcResponseNonceResolve(response: Response): Promise<OidcNonceExtractionResult> {
  let body: unknown
  try {
    body = await response.clone().json()
  } catch (_error) {
    return { category: "token_response_json" }
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) return { category: "token_response_json" }
  const tokenResponseBody = body as Record<string, unknown>
  if (!("id_token" in tokenResponseBody) || tokenResponseBody.id_token === undefined)
    return { category: "token_response_id_token_missing" }
  if (typeof tokenResponseBody.id_token !== "string") return { category: "token_response_id_token_type" }
  return oidcUnverifiedNonceResolve(tokenResponseBody.id_token)
}

function oidcUnverifiedNonceResolve(idToken: string): OidcNonceExtractionResult {
  const payload = idToken.split(".")[1]
  if (payload === undefined) return { category: "id_token_jwt_payload_missing" }
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (claims === null || typeof claims !== "object" || Array.isArray(claims))
      return { category: "id_token_payload_json" }
    const idTokenClaims = claims as Record<string, unknown>
    if (!("nonce" in idTokenClaims) || idTokenClaims.nonce === undefined) return { category: "id_token_nonce_missing" }
    if (idTokenClaims.nonce === "") return { category: "id_token_nonce_empty" }
    if (typeof idTokenClaims.nonce !== "string") return { category: "id_token_nonce_type" }
    return { category: "success", nonce: idTokenClaims.nonce }
  } catch (_error) {
    return { category: "id_token_payload_json" }
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

async function oidcResourceOwnerIdResolve(
  authorizationServer: oauth.AuthorizationServer,
  client: oauth.Client,
  claims: oauth.IDToken,
  tokenResponse: oauth.TokenEndpointResponse | undefined,
  providerFetch: OidcProviderFetch | undefined,
): Promise<OidcResourceOwnerResult> {
  const op = "oidcResourceOwnerIdResolve"
  const idTokenValue = claims[oidcResourceOwnerClaim]
  if (idTokenValue !== undefined) {
    const resourceOwnerId = oidcProfileStringResolve(idTokenValue)
    return resourceOwnerId === undefined
      ? oidcResourceOwnerError(op, "The OIDC resource-owner claim is invalid.", "resource_owner_validation")
      : createResult(resourceOwnerId)
  }

  if (authorizationServer.userinfo_endpoint === undefined || tokenResponse?.access_token === undefined) {
    return oidcResourceOwnerError(op, "The OIDC resource-owner claim is missing.", "resource_owner_validation")
  }

  let response: Response
  try {
    response = await oauth.userInfoRequest(authorizationServer, client, tokenResponse.access_token, {
      [oauth.customFetch]: oidcProviderCustomFetch(providerFetch),
    })
  } catch (_error) {
    return oidcResourceOwnerError(op, "The OIDC resource-owner claim could not be validated.", "userinfo")
  }
  if (!response.ok)
    return oidcResourceOwnerError(op, "The OIDC resource-owner claim could not be validated.", "userinfo")

  try {
    const userInfo = await oauth.processUserInfoResponse(authorizationServer, client, claims.sub, response)
    const resourceOwnerId = oidcProfileStringResolve(userInfo[oidcResourceOwnerClaim])
    return resourceOwnerId === undefined
      ? oidcResourceOwnerError(op, "The OIDC resource-owner claim is missing.", "resource_owner_validation")
      : createResult(resourceOwnerId)
  } catch (_error) {
    return oidcResourceOwnerError(op, "The OIDC resource-owner claim could not be validated.", "subject_consistency")
  }
}

type OidcResourceOwnerResult = Result<string> & {
  callbackStage?: "userinfo" | "subject_consistency" | "resource_owner_validation"
}

function oidcResourceOwnerError(
  op: string,
  errorMessage: string,
  callbackStage: NonNullable<OidcResourceOwnerResult["callbackStage"]>,
): OidcResourceOwnerResult {
  return { ...createResultError(op, errorMessage), callbackStage }
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
