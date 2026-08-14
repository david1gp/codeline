import * as oauth from "oauth4webapi"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { OidcProviderFetch } from "./oidcProviderFetch.js"
import type { OidcProviderMetadata } from "./oidcProviderMetadata.js"

type OidcProviderDiscoveryOptions = {
  fetch?: OidcProviderFetch
  maxResponseBytes?: number
  now?: () => Date
  timeoutMs?: number
  ttlMs?: number
}

type OidcProviderDiscoveryCacheEntry = {
  expiresAt: number
  result?: Result<OidcProviderMetadata>
  pending?: Promise<Result<OidcProviderMetadata>>
}

const asymmetricSigningAlgorithms = new Set([
  "Ed25519",
  "EdDSA",
  "ES256",
  "ES384",
  "ES512",
  "PS256",
  "PS384",
  "PS512",
  "RS256",
  "RS384",
  "RS512",
])

export function oidcProviderDiscoveryCreate(options: OidcProviderDiscoveryOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch
  const maxResponseBytes = options.maxResponseBytes ?? 64 * 1024
  const now = options.now ?? (() => new Date())
  const timeoutMs = options.timeoutMs ?? 5_000
  const ttlMs = options.ttlMs ?? 5 * 60 * 1_000
  const cache = new Map<string, OidcProviderDiscoveryCacheEntry>()

  return async (issuerValue: string): Promise<Result<OidcProviderMetadata>> => {
    const currentTime = now().getTime()
    const cached = cache.get(issuerValue)
    if (cached?.result !== undefined && cached.expiresAt > currentTime) return cached.result
    if (cached?.pending !== undefined) return cached.pending

    const pending = oidcProviderDiscoveryFetch(issuerValue, {
      fetcher,
      maxResponseBytes,
      timeoutMs,
    })
    cache.set(issuerValue, { pending, expiresAt: 0 })

    const result = await pending
    if (!result.success) {
      cache.delete(issuerValue)
      return result
    }

    cache.set(issuerValue, { expiresAt: now().getTime() + ttlMs, result })
    return result
  }
}

async function oidcProviderDiscoveryFetch(
  issuerValue: string,
  options: {
    fetcher: OidcProviderFetch
    maxResponseBytes: number
    timeoutMs: number
  },
): Promise<Result<OidcProviderMetadata>> {
  const op = "oidcProviderDiscoveryFetch"
  let issuer: URL
  try {
    issuer = new URL(issuerValue)
  } catch (_error) {
    return createResultError(op, "The OIDC issuer is invalid.")
  }

  try {
    const response = await oauth.discoveryRequest(issuer, {
      signal: AbortSignal.timeout(options.timeoutMs),
      [oauth.customFetch]: (url, request) =>
        options.fetcher(url, {
          headers: request.headers,
          method: request.method,
          redirect: request.redirect,
          signal: request.signal,
        }),
    })
    if (!response.ok) return createResultError(op, "The OIDC provider discovery request failed.")

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > options.maxResponseBytes) {
      return createResultError(op, "The OIDC provider discovery response is too large.")
    }

    const body = await response.text()
    if (new TextEncoder().encode(body).byteLength > options.maxResponseBytes) {
      return createResultError(op, "The OIDC provider discovery response is too large.")
    }

    const metadata = await oauth.processDiscoveryResponse(
      issuer,
      new Response(body, { headers: response.headers, status: response.status, statusText: response.statusText }),
    )
    if (metadata.issuer !== issuerValue) return createResultError(op, "The OIDC provider issuer does not match.")

    const authorizationEndpoint = oidcProviderEndpointResolve(metadata.authorization_endpoint)
    const tokenEndpoint = oidcProviderEndpointResolve(metadata.token_endpoint)
    const jwksUri = oidcProviderEndpointResolve(metadata.jwks_uri)
    if (authorizationEndpoint === undefined || tokenEndpoint === undefined || jwksUri === undefined) {
      return createResultError(op, "The OIDC provider endpoints are invalid.")
    }
    if (!metadata.response_types_supported?.includes("code")) {
      return createResultError(op, "The OIDC provider does not support authorization code flow.")
    }
    if (
      metadata.grant_types_supported !== undefined &&
      !metadata.grant_types_supported.includes("authorization_code")
    ) {
      return createResultError(op, "The OIDC provider does not support authorization code flow.")
    }
    if (!metadata.code_challenge_methods_supported?.includes("S256")) {
      return createResultError(op, "The OIDC provider does not support S256 PKCE.")
    }
    if (
      !metadata.id_token_signing_alg_values_supported?.some((algorithm) => asymmetricSigningAlgorithms.has(algorithm))
    ) {
      return createResultError(op, "The OIDC provider does not advertise asymmetric ID-token signing.")
    }

    return createResult({
      authorizationEndpoint,
      authorizationResponseIssParameterSupported: metadata.authorization_response_iss_parameter_supported === true,
      codeChallengeMethodsSupported: metadata.code_challenge_methods_supported,
      idTokenSigningAlgValuesSupported: metadata.id_token_signing_alg_values_supported,
      issuer: metadata.issuer,
      jwksUri,
      responseTypesSupported: metadata.response_types_supported,
      tokenEndpoint,
      tokenEndpointAuthMethodsSupported: metadata.token_endpoint_auth_methods_supported ?? ["client_secret_basic"],
    })
  } catch (_error) {
    return createResultError(op, "The OIDC provider discovery request failed.")
  }
}

function oidcProviderEndpointResolve(value: string | undefined): string | undefined {
  if (value === undefined) return undefined

  try {
    const endpoint = new URL(value)
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username !== "" ||
      endpoint.password !== "" ||
      endpoint.search !== "" ||
      endpoint.hash !== ""
    ) {
      return undefined
    }
    return endpoint.toString()
  } catch (_error) {
    return undefined
  }
}
