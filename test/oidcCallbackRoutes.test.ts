import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { appCreate } from "../src/app/appCreate.js"
import type { identitySessionCreate } from "../src/identity/actions/identitySessionCreate.js"
import type { oidcIdentityUpsert } from "../src/identity/actions/oidcIdentityUpsert.js"
import type { oidcLoginTransactionConsume } from "../src/identity/db/oidcLoginTransactionConsume.js"
import type { oidcLoginTransactionTable } from "../src/identity/db/oidcLoginTransactionTable.js"
import type { OidcProviderFetch } from "../src/identity/oidc/oidcProviderFetch.js"
import type { OidcProviderMetadata } from "../src/identity/oidc/oidcProviderMetadata.js"
import { oidcResourceOwnerClaim } from "../src/identity/oidc/oidcResourceOwnerClaim.js"

const now = new Date("2026-08-14T12:00:00.000Z")
const configuration = {
  authMode: "oidc" as const,
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "production" as const,
  oidcCallbackUrl: "https://codeline.test/login/zitadel/callback",
  oidcClientId: "client-id",
  oidcClientSecret: "client-secret",
  oidcIssuer: "https://issuer.codeline.test",
  oidcOrganizationId: "organization-id",
  publicOrigin: "https://codeline.test",
}
const metadata: OidcProviderMetadata = {
  authorizationEndpoint: "https://issuer.codeline.test/authorize",
  authorizationResponseIssParameterSupported: false,
  codeChallengeMethodsSupported: ["S256"],
  idTokenSigningAlgValuesSupported: ["RS256"],
  issuer: configuration.oidcIssuer,
  jwksUri: "https://issuer.codeline.test/jwks",
  responseTypesSupported: ["code"],
  tokenEndpoint: "https://issuer.codeline.test/token",
  tokenEndpointAuthMethodsSupported: ["client_secret_basic"],
  userinfoEndpoint: "https://issuer.codeline.test/userinfo",
}
const keyPair = await crypto.subtle.generateKey(
  { hash: "SHA-256", modulusLength: 2048, name: "RSASSA-PKCS1-v1_5", publicExponent: new Uint8Array([1, 0, 1]) },
  true,
  ["sign", "verify"],
)
const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey)

test("OIDC callback uses the exact configured path, validates the mocked token and JWKS, rotates sessions, and persists no provider token", async () => {
  let storedProfile: Record<string, unknown> | undefined
  let tokenRequestBody = ""
  let tokenRequestAuthorization = ""
  const app = callbackApp({
    providerFetch: async (input, init) => {
      if (String(input) === metadata.tokenEndpoint) {
        const request = new Request(input, init)
        tokenRequestAuthorization = request.headers.get("authorization") ?? ""
        tokenRequestBody = await request.text()
        return tokenResponse(
          await signedIdToken({ email: "verified@example.test", email_verified: true, name: "Verified User" }),
        )
      }
      return jwksResponse()
    },
    identityUpsert: async (_database, profile) => {
      storedProfile = profile
      return createResult(applicationUser)
    },
  })

  const response = await app.request(
    "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
    { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
  )

  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toBe("/files")
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  expect(response.headers.get("set-cookie")).toContain("__Host-codeline-oidc-binding=")
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0")
  expect(response.headers.get("set-cookie")).toContain("__Host-codeline-session=fresh-session")
  expect(tokenRequestBody).toContain("code_verifier=stored-code-verifier")
  expect(tokenRequestAuthorization).toContain("Basic ")
  expect(storedProfile).toEqual({
    displayName: "Verified User",
    issuer: configuration.oidcIssuer,
    organizationExternalId: configuration.oidcOrganizationId,
    subject: "subject-value",
    verifiedEmail: "verified@example.test",
  })
  expect(JSON.stringify(storedProfile)).not.toContain("access-token")
})

test("OIDC callback diagnostics classify token exchange failures without logging callback secrets", async () => {
  const stages: string[] = []
  const originalConsoleLog = console.log
  console.log = (...values: unknown[]) => stages.push(values.map(String).join(" "))
  try {
    const app = callbackApp({
      providerFetch: async (input) => {
        if (String(input) === metadata.tokenEndpoint)
          throw new Error(
            "authorization-code access-token state-value nonce-value browser-binding client-secret subject-value organization-id",
          )
        return jwksResponse()
      },
    })
    const response = await app.request(
      "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
      { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
    )

    expect(response.status).toBe(400)
    expect(stages).toEqual(["auth_callback_stage=token_exchange"])
    expect(stages.join(" ")).not.toContain("authorization-code")
    expect(stages.join(" ")).not.toContain("access-token")
    expect(stages.join(" ")).not.toContain("state-value")
    expect(stages.join(" ")).not.toContain("nonce-value")
    expect(stages.join(" ")).not.toContain("browser-binding")
    expect(stages.join(" ")).not.toContain("client-secret")
    expect(stages.join(" ")).not.toContain("subject-value")
    expect(stages.join(" ")).not.toContain("organization-id")
  } finally {
    console.log = originalConsoleLog
  }
})

test("OIDC callback nonce diagnostics distinguish missing and mismatched nonces without disclosure", async () => {
  const stages: string[] = []
  const originalConsoleLog = console.log
  console.log = (...values: unknown[]) => stages.push(values.map(String).join(" "))
  const idTokens: string[] = []
  try {
    for (const failure of [
      { name: "missing", nonce: undefined },
      { name: "mismatch", nonce: "unexpected-nonce" },
    ]) {
      const idToken = await signedIdToken({ name: `claims-${failure.name}-secret`, nonce: failure.nonce })
      idTokens.push(idToken)
      const app = callbackApp({
        providerFetch: async (input) => {
          if (String(input) === metadata.tokenEndpoint) return tokenResponse(idToken)
          return jwksResponse()
        },
      })
      const response = await app.request(
        "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
        { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
      )

      expect(response.status).toBe(400)
    }

    expect(stages).toEqual(["auth_callback_stage=id_token_nonce_missing", "auth_callback_stage=nonce_mismatch"])
    const diagnostics = stages.join(" ")
    for (const value of [
      "nonce-value",
      "unexpected-nonce",
      "claims-missing-secret",
      "claims-mismatch-secret",
      "authorization-code",
      "state-value",
      "browser-binding",
      "subject-value",
      "organization-id",
    ])
      expect(diagnostics).not.toContain(value)
    for (const idToken of idTokens) expect(diagnostics).not.toContain(idToken)
  } finally {
    console.log = originalConsoleLog
  }
})

test("OIDC callback classifies every nonce extraction failure without logging token secrets", async () => {
  const stages: string[] = []
  const originalConsoleLog = console.log
  console.log = (...values: unknown[]) => stages.push(values.map(String).join(" "))
  const secret = "callback-classifier-secret"
  try {
    const cases: Array<{ category: string; response: () => Response | Promise<Response> }> = [
      { category: "token_response_json", response: () => new Response(`{"secret":"${secret}"`) },
      { category: "token_response_json", response: () => new Response("null") },
      { category: "token_response_json", response: () => new Response(JSON.stringify([secret])) },
      {
        category: "token_response_id_token_missing",
        response: () =>
          new Response(JSON.stringify({ access_token: secret }), { headers: { "content-type": "application/json" } }),
      },
      {
        category: "token_response_id_token_type",
        response: () =>
          new Response(JSON.stringify({ access_token: secret, id_token: null }), {
            headers: { "content-type": "application/json" },
          }),
      },
      { category: "id_token_jwt_payload_missing", response: () => tokenResponse(`header-${secret}`) },
      {
        category: "id_token_payload_json",
        response: () => tokenResponse(`header.${base64url(`{"secret":"${secret}"`)}.signature`),
      },
      { category: "id_token_payload_json", response: () => tokenResponse(`header.${base64url("null")}.signature`) },
      {
        category: "id_token_nonce_missing",
        response: () => tokenResponseFromClaims({ name: `missing-${secret}`, nonce: undefined }),
      },
      {
        category: "id_token_nonce_empty",
        response: () => tokenResponseFromClaims({ name: `empty-${secret}`, nonce: "" }),
      },
      {
        category: "id_token_nonce_type",
        response: () => tokenResponseFromClaims({ name: `type-${secret}`, nonce: { secret } }),
      },
    ]

    for (const failure of cases) {
      const app = callbackApp({
        providerFetch: async (input) =>
          String(input) === metadata.tokenEndpoint ? await failure.response() : jwksResponse(),
      })
      const response = await app.request(
        "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
        { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
      )

      expect(response.status).toBe(400)
      expect(stages.at(-1)).toBe(`auth_callback_stage=${failure.category}`)
    }

    expect(stages).toHaveLength(cases.length)
    expect(stages.join(" ")).not.toContain(secret)
  } finally {
    console.log = originalConsoleLog
  }
})

test("OIDC callback rejects missing and disallowed resource-owner claims before identity persistence", async () => {
  for (const claims of [{ [oidcResourceOwnerClaim]: "other-organization" }, { [oidcResourceOwnerClaim]: undefined }]) {
    let identityCalled = false
    const app = callbackApp({
      identityUpsert: async () => {
        identityCalled = true
        return createResult(applicationUser)
      },
      providerFetch: async (input) => {
        if (String(input) === metadata.tokenEndpoint) return tokenResponse(await signedIdToken(claims))
        return jwksResponse()
      },
    })

    const response = await app.request(
      "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
      { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
    )

    expect(response.status).toBe(400)
    expect(identityCalled).toBe(false)
    expect(response.headers.get("set-cookie")).not.toContain("__Host-codeline-session=fresh-session")
  }
})

test("OIDC callback rejects malformed resource-owner claims before identity persistence", async () => {
  for (const claim of [[], {}, "", "   "]) {
    let identityCalled = false
    const app = callbackApp({
      identityUpsert: async () => {
        identityCalled = true
        return createResult(applicationUser)
      },
      providerFetch: async (input) => {
        if (String(input) === metadata.tokenEndpoint)
          return tokenResponse(await signedIdToken({ [oidcResourceOwnerClaim]: claim }))
        return jwksResponse()
      },
    })

    const response = await app.request(
      "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
      { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
    )

    expect(response.status).toBe(400)
    expect(identityCalled).toBe(false)
  }
})

test("OIDC callback validates a missing ID-token resource-owner claim through standards-compliant UserInfo", async () => {
  let userInfoAuthorization = ""
  let profile: Record<string, unknown> | undefined
  const app = callbackApp({
    identityUpsert: async (_database, value) => {
      profile = value
      return createResult(applicationUser)
    },
    providerFetch: async (input, init) => {
      if (String(input) === metadata.tokenEndpoint)
        return tokenResponse(await signedIdToken({ [oidcResourceOwnerClaim]: undefined }))
      if (String(input) === metadata.userinfoEndpoint) {
        userInfoAuthorization = new Request(input, init).headers.get("authorization") ?? ""
        return Response.json({ sub: "subject-value", [oidcResourceOwnerClaim]: configuration.oidcOrganizationId })
      }
      return jwksResponse()
    },
  })

  const response = await app.request(
    "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
    { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
  )

  expect(response.status).toBe(302)
  expect(userInfoAuthorization).toBe("Bearer access-token")
  expect(profile).toEqual({
    displayName: "OIDC Subject",
    issuer: configuration.oidcIssuer,
    organizationExternalId: configuration.oidcOrganizationId,
    subject: "subject-value",
  })
  expect(JSON.stringify(profile)).not.toContain("access-token")
})

test("OIDC callback accepts proxied internal HTTP, preserves query parameters, and ignores forwarded authority", async () => {
  let tokenRequestBody = ""
  const app = callbackApp({
    providerFetch: async (input, init) => {
      if (String(input) === metadata.tokenEndpoint) {
        tokenRequestBody = await new Request(input, init).text()
        return tokenResponse(await signedIdToken({}))
      }
      return jwksResponse()
    },
  })

  const response = await app.request(
    "http://127.0.0.1/login/zitadel/callback?code=authorization-code&state=state-value",
    {
      headers: {
        "x-forwarded-host": "attacker.example.test",
        "x-forwarded-proto": "https",
        Cookie: "__Host-codeline-oidc-binding=browser-binding",
      },
    },
  )

  expect(response.status).toBe(302)
  expect(tokenRequestBody).toContain("code=authorization-code")
  expect(tokenRequestBody).toContain("redirect_uri=https%3A%2F%2Fcodeline.test%2Flogin%2Fzitadel%2Fcallback")
})

test("OIDC callback rejects a path that is not the exact configured callback path", async () => {
  let consumed = false
  const app = callbackApp({
    consume: async () => {
      consumed = true
      return createResult(transaction)
    },
  })

  const response = await app.request(
    "http://127.0.0.1/login/zitadel/callback/extra?code=authorization-code&state=state-value",
    { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
  )

  expect(response.status).toBe(404)
  expect(consumed).toBe(false)
})

test("OIDC callback rejects replay, state, and browser-binding failures with cleared no-store flow state", async () => {
  for (const request of [
    { cookie: "browser-binding", state: "state-value", expected: "consumed" },
    { cookie: "browser-binding", state: "wrong-state", expected: "rejected" },
    { cookie: "wrong-binding", state: "state-value", expected: "rejected" },
  ]) {
    let consumeResult: "consumed" | "rejected" = "rejected"
    const app = callbackApp({
      consume: async (_database, state, _at, browserBinding) => {
        if (state === "state-value" && browserBinding === "browser-binding" && request.expected === "consumed") {
          consumeResult = "consumed"
          return createResult(transaction)
        }
        return createResult(undefined)
      },
    })
    const response = await app.request(
      `https://codeline.test/login/zitadel/callback?code=authorization-code&state=${request.state}`,
      { headers: { Cookie: `__Host-codeline-oidc-binding=${request.cookie}` } },
    )
    expect(response.status).toBe(request.expected === "consumed" ? 302 : 400)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("set-cookie")).toContain("__Host-codeline-oidc-binding=")
    expect(String(consumeResult)).toBe(request.expected)
  }
})

test("OIDC callback rejects nonce, audience, issuer, signature, expiry, and issued-at failures", async () => {
  const failures = [
    { name: "nonce", claims: { nonce: "different-nonce" } },
    { name: "audience", claims: { aud: "different-client" } },
    { name: "issuer", claims: { iss: "https://other-issuer.test" } },
    { name: "expiry", claims: { exp: Math.floor(now.getTime() / 1_000) - 60 } },
    { name: "issued-at", claims: { iat: Math.floor(now.getTime() / 1_000) + 60 } },
  ]

  for (const failure of failures) {
    const app = callbackApp({
      providerFetch: async (input, _init) => {
        if (String(input) === metadata.tokenEndpoint) {
          return tokenResponse(
            await signedIdToken({
              ...failure.claims,
              ...(failure.name === "nonce" ? {} : { nonce: "nonce-value" }),
            }),
          )
        }
        return jwksResponse()
      },
    })
    const response = await app.request(
      "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
      { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
    )
    expect(response.status, failure.name).toBe(400)
  }

  const invalidSignatureApp = callbackApp({
    providerFetch: async (input) => {
      if (String(input) === metadata.tokenEndpoint) {
        const idToken = await signedIdToken({})
        const parts = idToken.split(".")
        const signature = Buffer.from(parts[2] ?? "", "base64url")
        signature[0] = (signature[0] ?? 0) ^ 1
        return tokenResponse(`${parts[0]}.${parts[1]}.${Buffer.from(signature).toString("base64url")}`)
      }
      return jwksResponse()
    },
  })
  const invalidSignature = await invalidSignatureApp.request(
    "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
    { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
  )
  expect(invalidSignature.status).toBe(400)
})

test("OIDC callback forwards only verified email, reuses the external identity, and prevents session fixation", async () => {
  let profile: Record<string, unknown> | undefined
  let revokedSessionId = ""
  const app = callbackApp({
    providerFetch: async (input, _init) => {
      if (String(input) === metadata.tokenEndpoint) {
        return tokenResponse(await signedIdToken({ email: "unverified@example.test", email_verified: false }))
      }
      return jwksResponse()
    },
    identityUpsert: async (_database, value) => {
      profile = value
      return createResult(applicationUser)
    },
    sessionLoad: async () => createResult({ ...session, id: "presented-session" }),
    sessionRevoke: async (_database, sessionId) => {
      revokedSessionId = sessionId
      return createResult(session)
    },
  })
  const response = await app.request(
    "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
    {
      headers: {
        Cookie: "__Host-codeline-oidc-binding=browser-binding; __Host-codeline-session=attacker-presented-token",
      },
    },
  )

  expect(response.status).toBe(302)
  expect(revokedSessionId).toBe("presented-session")
  expect(profile).toEqual({
    displayName: "OIDC Subject",
    issuer: configuration.oidcIssuer,
    organizationExternalId: configuration.oidcOrganizationId,
    subject: "subject-value",
  })
  expect(response.headers.get("set-cookie")).toContain("__Host-codeline-session=fresh-session")
  expect(response.headers.get("set-cookie")).not.toContain("attacker-presented-token")
})

test("OIDC callback retries JWKS selection once for a rotated signing key", async () => {
  let jwksRequests = 0
  const app = callbackApp({
    providerFetch: async (input) => {
      if (String(input) === metadata.jwksUri) {
        jwksRequests += 1
        return jwksResponse(jwksRequests === 1 ? "old-key" : "test-key")
      }
      return tokenResponse(await signedIdToken({}))
    },
  })

  const response = await app.request(
    "https://codeline.test/login/zitadel/callback?code=authorization-code&state=state-value",
    { headers: { Cookie: "__Host-codeline-oidc-binding=browser-binding" } },
  )

  expect(response.status).toBe(302)
  expect(jwksRequests).toBe(2)
})

type CallbackOptions = {
  consume?: typeof oidcLoginTransactionConsume
  identityUpsert?: typeof oidcIdentityUpsert
  providerFetch?: OidcProviderFetch
  sessionLoad?: typeof import("../src/identity/actions/identitySessionLoad.js").identitySessionLoad
  sessionRevoke?: typeof import("../src/identity/actions/identitySessionRevoke.js").identitySessionRevoke
}

function callbackApp(options: CallbackOptions = {}) {
  return appCreate({
    configuration,
    database: {} as never,
    identitySessionCreate: (async () =>
      createResult({ session, token: "fresh-session" })) as typeof identitySessionCreate,
    identitySessionLoad: options.sessionLoad ?? (async () => createResult(undefined)),
    identitySessionRevoke: options.sessionRevoke ?? (async () => createResult(session)),
    oidcIdentityUpsert: options.identityUpsert ?? (async () => createResult(applicationUser)),
    oidcLoginTransactionConsume: options.consume ?? (async () => createResult(transaction)),
    oidcNow: () => now,
    oidcProviderDiscovery: async () => createResult(metadata),
    oidcProviderFetch:
      options.providerFetch ??
      (async (input) =>
        String(input) === metadata.tokenEndpoint ? tokenResponse(await signedIdToken({})) : jwksResponse()),
    oidcReturnToPathIsKnown: (path) => path === "/" || path === "/files",
  })
}

const transaction = {
  browserBindingHash: createHash("sha256").update("browser-binding").digest("hex"),
  codeVerifier: "stored-code-verifier",
  consumedAt: null,
  createdAt: now,
  expiresAt: new Date(now.getTime() + 600_000),
  id: "transaction-id",
  issuer: configuration.oidcIssuer,
  nonceHash: createHash("sha256").update("nonce-value").digest("hex"),
  redirectUri: configuration.oidcCallbackUrl,
  returnTo: "/files",
  stateHash: createHash("sha256").update("state-value").digest("hex"),
} satisfies typeof oidcLoginTransactionTable.$inferSelect

const applicationUser = {
  createdAt: now,
  displayName: "OIDC Subject",
  email: null,
  id: "oidc:user",
  updatedAt: now,
}
const session = {
  createdAt: now,
  expiresAt: new Date(now.getTime() + 43_200_000),
  id: "session-id",
  lastUsedAt: null,
  revokedAt: null,
  tokenHash: "stored-token-hash",
  userId: applicationUser.id,
}

async function signedIdToken(overrides: Record<string, unknown>): Promise<string> {
  const header = { alg: "RS256", kid: "test-key", typ: "JWT" }
  const payload = {
    aud: configuration.oidcClientId,
    email: "unverified@example.test",
    email_verified: false,
    exp: Math.floor(now.getTime() / 1_000) + 300,
    iat: Math.floor(now.getTime() / 1_000),
    iss: configuration.oidcIssuer,
    name: "OIDC Subject",
    nonce: "nonce-value",
    [oidcResourceOwnerClaim]: configuration.oidcOrganizationId,
    sub: "subject-value",
    ...overrides,
  }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`
}

function tokenResponse(idToken: string): Response {
  return new Response(JSON.stringify({ access_token: "access-token", id_token: idToken, token_type: "Bearer" }), {
    headers: { "content-type": "application/json" },
    status: 200,
  })
}

async function tokenResponseFromClaims(overrides: Record<string, unknown>): Promise<Response> {
  return tokenResponse(await signedIdToken(overrides))
}

function jwksResponse(kid = "test-key"): Response {
  return new Response(JSON.stringify({ keys: [{ ...publicJwk, alg: "RS256", kid, use: "sig" }] }), {
    headers: { "content-type": "application/json" },
    status: 200,
  })
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url")
}
