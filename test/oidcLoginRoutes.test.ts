import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import * as oauth from "oauth4webapi"
import { appCreate } from "../src/app/appCreate.js"
import { oidcLoginReturnToResolve } from "../src/identity/oidc/oidcLoginReturnToResolve.js"
import { oidcProviderDiscoveryCreate } from "../src/identity/oidc/oidcProviderDiscoveryCreate.js"
import { oidcResourceOwnerScope } from "../src/identity/oidc/oidcResourceOwnerScope.js"

const configuration = {
  authMode: "oidc" as const,
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "production" as const,
  oidcCallbackUrl: "https://codeline.test/login/callback",
  oidcClientId: "client-id",
  oidcIssuer: "https://issuer.codeline.test",
  oidcOrganizationId: "organization-id",
  publicOrigin: "https://codeline.test",
}

const metadata = {
  authorization_endpoint: "https://issuer.codeline.test/authorize",
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code"],
  id_token_signing_alg_values_supported: ["RS256"],
  issuer: configuration.oidcIssuer,
  jwks_uri: "https://issuer.codeline.test/jwks",
  response_types_supported: ["code"],
  scopes_supported: ["openid", "profile", "email", oidcResourceOwnerScope],
  token_endpoint: "https://issuer.codeline.test/token",
}
const multiProviderConfiguration = {
  authMode: "oidc" as const,
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "production" as const,
  oidcCallbackUrl: "https://codeline.test/api/auth/callback",
  oidcOrganizationId: "organization-id",
  oidcProviders: {
    authworks: {
      callbackUrl: "https://codeline.test/api/auth/callback",
      clientId: "authworks-client-id",
      clientSecret: "authworks-client-secret",
      issuer: "https://authworks.codeline.test",
      organizationId: "organization-id",
    },
    zitadel: {
      callbackUrl: "https://codeline.test/api/auth/callback",
      clientId: "zitadel-client-id",
      clientSecret: "zitadel-client-secret",
      issuer: "https://zitadel.codeline.test",
      organizationId: "organization-id",
    },
  },
  publicOrigin: "https://codeline.test",
}
const multiProviderMetadata = {
  authworks: {
    ...metadata,
    authorization_endpoint: "https://authworks.codeline.test/authorize",
    issuer: multiProviderConfiguration.oidcProviders.authworks.issuer,
    jwks_uri: "https://authworks.codeline.test/jwks",
    token_endpoint: "https://authworks.codeline.test/token",
  },
  zitadel: {
    ...metadata,
    authorization_endpoint: "https://zitadel.codeline.test/authorize",
    issuer: multiProviderConfiguration.oidcProviders.zitadel.issuer,
    jwks_uri: "https://zitadel.codeline.test/jwks",
    token_endpoint: "https://zitadel.codeline.test/token",
  },
}

test("OIDC provider catalog exposes configured IDs and stable labels without configuration details", async () => {
  const app = appCreate({ configuration: multiProviderConfiguration, database: {} as never })

  const response = await app.request("https://codeline.test/api/auth/providers")
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(body).toEqual({
    providers: [
      { id: "authworks", label: "Authworks" },
      { id: "zitadel", label: "Zitadel" },
    ],
  })
  expect(JSON.stringify(body)).not.toContain("client-secret")
  expect(JSON.stringify(body)).not.toContain("issuer")
})

test("provider-neutral OIDC configuration uses a neutral catalog ID and label", async () => {
  const app = appCreate({ configuration, database: {} as never })

  const response = await app.request("https://codeline.test/api/auth/providers")

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ providers: [{ id: "legacy", label: "OIDC" }] })
})

test("legacy Zitadel configuration retains its Zitadel catalog ID and label", async () => {
  const app = appCreate({
    configuration: {
      ...configuration,
      oidcProviders: {
        zitadel: {
          clientId: configuration.oidcClientId,
          issuer: configuration.oidcIssuer,
          organizationId: configuration.oidcOrganizationId,
        },
      },
    },
    database: {} as never,
  })

  const response = await app.request("https://codeline.test/api/auth/providers")

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ providers: [{ id: "zitadel", label: "Zitadel" }] })
})

test("OIDC login returns the not-configured response when no providers are configured", async () => {
  const app = appCreate({
    configuration: { ...configuration, oidcProviders: {} },
    database: {} as never,
  })

  const response = await app.request("https://codeline.test/api/auth/login")

  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({
    error: { code: "internal_server_error", message: "OIDC login is not configured." },
  })
})

test("OIDC return paths preserve query and hash after validating the route pathname", () => {
  const pathIsKnown = (pathname: string) => pathname === "/sessions/search"
  const result = oidcLoginReturnToResolve(
    "/sessions/search?search=term&session=selected#chat",
    configuration.publicOrigin,
    pathIsKnown,
  )

  expect(result).toEqual({
    data: "/sessions/search?search=term&session=selected#chat",
    success: true,
  })
  expect(
    oidcLoginReturnToResolve("/sessions/unknown?search=term", configuration.publicOrigin, pathIsKnown).success,
  ).toBe(false)
})

test("OIDC login discovers once, stores a bound ten-minute transaction, and redirects with S256", async () => {
  let discoveryRequests = 0
  let storedTransaction: Record<string, unknown> | undefined
  let randomIndex = 0
  const randomValues = [
    "state-one",
    "nonce-one",
    "v".repeat(43),
    "binding-one",
    "state-two",
    "nonce-two",
    "w".repeat(43),
    "binding-two",
  ]
  const now = new Date("2026-08-14T12:00:00.000Z")
  const app = appCreate({
    configuration,
    database: {} as never,
    oidcIdCreate: () => "transaction-id",
    oidcNow: () => now,
    oidcProviderFetch: async () => {
      discoveryRequests += 1
      return new Response(JSON.stringify(metadata), {
        headers: { "content-type": "application/json" },
        status: 200,
      })
    },
    oidcRandomValueCreate: () => randomValues[randomIndex++] ?? "fallback-value",
    oidcLoginTransactionCreate: async (_database, transaction) => {
      storedTransaction = transaction
      return createResult({} as never)
    },
    oidcReturnToPathIsKnown: (pathname) => pathname === "/" || pathname === "/files",
  })

  const first = await app.request("https://codeline.test/api/auth/login?returnTo=/files")
  const second = await app.request("https://codeline.test/api/auth/login?returnTo=/files")
  const firstLocation = new URL(first.headers.get("location") ?? "")
  const secondLocation = new URL(second.headers.get("location") ?? "")

  expect(first.status).toBe(302)
  expect(second.status).toBe(302)
  expect(discoveryRequests).toBe(1)
  expect(first.headers.get("cache-control")).toBe("no-store")
  expect(first.headers.get("set-cookie")).toContain("__Host-codeline-oidc-binding=")
  expect(first.headers.get("set-cookie")).toContain("HttpOnly")
  expect(first.headers.get("set-cookie")).toContain("Secure")
  expect(first.headers.get("set-cookie")).toContain("Max-Age=600")
  expect(firstLocation.origin).toBe("https://issuer.codeline.test")
  expect(firstLocation.pathname).toBe("/authorize")
  expect(firstLocation.searchParams.get("client_id")).toBe("client-id")
  expect(firstLocation.searchParams.get("redirect_uri")).toBe(configuration.oidcCallbackUrl)
  expect(firstLocation.searchParams.get("response_type")).toBe("code")
  expect(firstLocation.searchParams.get("scope")).toBe(`openid profile email ${oidcResourceOwnerScope}`)
  expect(firstLocation.searchParams.get("state")).toBe("state-one")
  expect(firstLocation.searchParams.get("nonce")).toBe("nonce-one")
  expect(firstLocation.searchParams.get("code_challenge_method")).toBe("S256")
  expect(firstLocation.searchParams.get("code_challenge")).toBe(await oauth.calculatePKCECodeChallenge("v".repeat(43)))
  expect(secondLocation.searchParams.get("state")).toBe("state-two")
  expect(storedTransaction).toMatchObject({
    browserBinding: "binding-two",
    codeVerifier: "w".repeat(43),
    expiresAt: new Date("2026-08-14T12:10:00.000Z"),
    issuer: `${configuration.oidcIssuer}/`,
    nonce: "nonce-two",
    redirectUri: configuration.oidcCallbackUrl,
    returnTo: "/files",
    state: "state-two",
  })
})

test("OIDC login omits the resource-owner scope when the provider does not advertise it", async () => {
  const app = appCreate({
    configuration,
    database: {} as never,
    oidcLoginTransactionCreate: async () => createResult({} as never),
    oidcProviderFetch: async () =>
      new Response(JSON.stringify({ ...metadata, scopes_supported: ["openid", "profile", "email"] }), {
        headers: { "content-type": "application/json" },
      }),
    oidcReturnToPathIsKnown: (pathname) => pathname === "/" || pathname === "/files",
  })

  const response = await app.request("https://codeline.test/api/auth/login?returnTo=/files")
  const location = new URL(response.headers.get("location") ?? "")

  expect(response.status).toBe(302)
  expect(location.searchParams.get("scope")).toBe("openid profile email")
})

test("OIDC login requires and selects a normalized provider when multiple providers are configured", async () => {
  const discoveryIssuers: string[] = []
  const storedIssuers: string[] = []
  const app = appCreate({
    configuration: multiProviderConfiguration,
    database: {} as never,
    oidcLoginTransactionCreate: async (_database, transaction) => {
      storedIssuers.push(transaction.issuer)
      return createResult({} as never)
    },
    oidcProviderFetch: async (input) => {
      const issuer = Object.values(multiProviderConfiguration.oidcProviders).find((provider) =>
        String(input).startsWith(provider.issuer),
      )?.issuer
      if (issuer === undefined) return new Response("not found", { status: 404 })
      discoveryIssuers.push(issuer)
      const provider = issuer === multiProviderConfiguration.oidcProviders.authworks.issuer ? "authworks" : "zitadel"
      return new Response(JSON.stringify(multiProviderMetadata[provider]), {
        headers: { "content-type": "application/json" },
      })
    },
    oidcReturnToPathIsKnown: (pathname) => pathname === "/" || pathname === "/files",
  })

  const missing = await app.request("https://codeline.test/api/auth/login?returnTo=/files")
  const unknown = await app.request("https://codeline.test/api/auth/login?provider=other&returnTo=/files")
  const duplicate = await app.request(
    "https://codeline.test/api/auth/login?provider=authworks&provider=authworks&returnTo=/files",
  )
  const authworks = await app.request("https://codeline.test/api/auth/login?provider=authworks&returnTo=/files")
  const zitadel = await app.request("https://codeline.test/api/auth/login?provider=zitadel&returnTo=/files")
  const authworksLocation = new URL(authworks.headers.get("location") ?? "")
  const zitadelLocation = new URL(zitadel.headers.get("location") ?? "")

  expect(missing.status).toBe(400)
  expect(unknown.status).toBe(400)
  expect(duplicate.status).toBe(400)
  expect(authworks.status).toBe(302)
  expect(zitadel.status).toBe(302)
  expect(discoveryIssuers).toEqual([
    multiProviderConfiguration.oidcProviders.authworks.issuer,
    multiProviderConfiguration.oidcProviders.zitadel.issuer,
  ])
  expect(storedIssuers).toEqual([
    `${multiProviderConfiguration.oidcProviders.authworks.issuer}/`,
    `${multiProviderConfiguration.oidcProviders.zitadel.issuer}/`,
  ])
  expect(authworksLocation.origin).toBe("https://authworks.codeline.test")
  expect(authworksLocation.searchParams.get("client_id")).toBe("authworks-client-id")
  expect(zitadelLocation.origin).toBe("https://zitadel.codeline.test")
  expect(zitadelLocation.searchParams.get("client_id")).toBe("zitadel-client-id")
})

test("OIDC login rejects unknown and cross-origin return paths before discovery", async () => {
  let discoveryRequests = 0
  const app = appCreate({
    configuration,
    database: {} as never,
    oidcProviderFetch: async () => {
      discoveryRequests += 1
      return new Response(JSON.stringify(metadata), { headers: { "content-type": "application/json" } })
    },
    oidcReturnToPathIsKnown: (pathname) => pathname === "/",
  })

  const unknown = await app.request("https://codeline.test/api/auth/login?returnTo=/unknown")
  const crossOrigin = await app.request("https://codeline.test/api/auth/login?returnTo=https://attacker.test/")

  const loginLoop = await app.request("https://codeline.test/api/auth/login?returnTo=/login")

  expect(unknown.status).toBe(400)
  expect(crossOrigin.status).toBe(400)
  expect(loginLoop.status).toBe(400)
  expect(discoveryRequests).toBe(0)
})

test("OIDC discovery requires the configured issuer, HTTPS endpoints, code flow, S256, and asymmetric signing", async () => {
  const invalidMetadata = [
    { ...metadata, issuer: "https://other-issuer.codeline.test" },
    { ...metadata, authorization_endpoint: "http://issuer.codeline.test/authorize" },
    { ...metadata, response_types_supported: ["id_token"] },
    { ...metadata, code_challenge_methods_supported: ["plain"] },
    { ...metadata, id_token_signing_alg_values_supported: ["HS256"] },
  ]

  for (const body of invalidMetadata) {
    const providerDiscovery = oidcProviderDiscoveryCreate({
      fetch: async () => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }),
    })
    const result = await providerDiscovery(configuration.oidcIssuer)
    expect(result.success).toBe(false)
  }
})

test("OIDC discovery canonicalizes equivalent root-slash issuer spellings without collapsing paths", async () => {
  const cases = [
    {
      configuredIssuer: "https://issuer.codeline.test",
      metadataIssuer: "https://issuer.codeline.test",
      success: true,
    },
    {
      configuredIssuer: "https://issuer.codeline.test/",
      metadataIssuer: "https://issuer.codeline.test",
      success: true,
    },
    {
      configuredIssuer: "https://issuer.codeline.test/tenant",
      metadataIssuer: "https://issuer.codeline.test/tenant",
      success: true,
    },
    {
      configuredIssuer: "https://issuer.codeline.test/tenant",
      metadataIssuer: "https://issuer.codeline.test/other",
      success: false,
    },
  ]

  for (const testCase of cases) {
    const providerDiscovery = oidcProviderDiscoveryCreate({
      fetch: async () =>
        new Response(JSON.stringify({ ...metadata, issuer: testCase.metadataIssuer }), {
          headers: { "content-type": "application/json" },
        }),
    })
    const result = await providerDiscovery(testCase.configuredIssuer)
    expect(result.success).toBe(testCase.success)
    if (result.success) expect(result.data.issuer).toBe(testCase.metadataIssuer)
  }
})
