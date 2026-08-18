import { afterEach, expect, test } from "bun:test"
import { appCreate } from "../src/app/appCreate.js"
import { runtimeConfigurationParse } from "../src/configuration/runtimeConfigurationParse.js"
import { serverStart } from "../src/server/serverStart.js"

const environmentNames = [
  "AUTH_MODE",
  "DATABASE_URL",
  "NODE_ENV",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_ISSUER",
  "OIDC_REDIRECT_URI",
  "PUBLIC_ORIGIN",
  "ZITADEL_CLIENT_ID",
  "ZITADEL_CLIENT_SECRET",
  "ZITADEL_ISSUER",
  "ZITADEL_ORGANIZATION_ID",
  "ZITADEL_REDIRECT_URI",
] as const
const originalEnvironment = Object.fromEntries(environmentNames.map((name) => [name, Bun.env[name]]))

afterEach(() => {
  for (const name of environmentNames) {
    const value = originalEnvironment[name]
    if (value === undefined) delete Bun.env[name]
    else Bun.env[name] = value
  }
})

test("development authentication is allowed only outside production and derives no OIDC callback", () => {
  const result = runtimeConfigurationParse({
    authMode: "development",
    databaseUrl: "postgres://codeline.test/codeline",
    nodeEnv: "test",
    publicOrigin: "http://localhost:6000",
  })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.oidcCallbackUrl).toBeUndefined()
})

test("production startup fails closed without exposing OIDC values", async () => {
  Bun.env.AUTH_MODE = "development"
  Bun.env.DATABASE_URL = "postgres://secret:password@127.0.0.1:6002/codeline"
  Bun.env.NODE_ENV = "production"
  Bun.env.PUBLIC_ORIGIN = "https://codeline.example.test"

  await expect(
    serverStart({
      appCreate: () => appCreate(),
      serve: () => {
        throw new Error("server must not start")
      },
    }),
  ).rejects.toThrow("AUTH_MODE")
})

test("OIDC configuration derives the provider-neutral callback URL", () => {
  const result = runtimeConfigurationParse({
    authMode: "oidc",
    databaseUrl: "postgres://codeline.test/codeline",
    nodeEnv: "production",
    oidcClientId: "client-id-value",
    oidcIssuer: "https://issuer.example.test/tenant",
    oidcOrganizationId: "organization-id-value",
    publicOrigin: "https://codeline.example.test",
  })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.oidcCallbackUrl).toBe("https://codeline.example.test/api/auth/callback")
})

test("OIDC configuration preserves the issuer's root slash and path spelling", () => {
  for (const oidcIssuer of [
    "https://issuer.example.test",
    "https://issuer.example.test/",
    "https://issuer.example.test/tenant",
  ]) {
    const result = runtimeConfigurationParse({
      authMode: "oidc",
      databaseUrl: "postgres://codeline.test/codeline",
      nodeEnv: "production",
      oidcClientId: "client-id-value",
      oidcIssuer,
      oidcOrganizationId: "organization-id-value",
      publicOrigin: "https://codeline.example.test",
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.oidcIssuer).toBe(oidcIssuer)
  }
})

test("OIDC configuration requires the allowed ZITADEL organization ID", () => {
  const result = runtimeConfigurationParse({
    authMode: "oidc",
    databaseUrl: "postgres://codeline.test/codeline",
    nodeEnv: "production",
    oidcClientId: "client-id",
    oidcIssuer: "https://issuer.example.test",
    publicOrigin: "https://codeline.example.test",
  })

  expect(result.success).toBe(false)
  if (!result.success) expect(result.errorMessage).toContain("ZITADEL_ORGANIZATION_ID")
})

test("Zitadel aliases normalize to provider-neutral fields and preserve the provisioned callback path", () => {
  const result = runtimeConfigurationParse({
    AUTH_MODE: "oidc",
    ZITADEL_CLIENT_ID: "redacted-client-id",
    ZITADEL_CLIENT_SECRET: "redacted-client-secret",
    ZITADEL_ISSUER: "https://issuer.example.test/tenant",
    ZITADEL_ORGANIZATION_ID: "redacted-organization-id",
    ZITADEL_REDIRECT_URI: "https://codeline.example.test/login/zitadel/callback",
    databaseUrl: "postgres://codeline.test/codeline",
    nodeEnv: "production",
    PUBLIC_ORIGIN: "https://codeline.example.test",
  })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data).toMatchObject({
    oidcCallbackUrl: "https://codeline.example.test/login/zitadel/callback",
    oidcClientId: "redacted-client-id",
    oidcClientSecret: "redacted-client-secret",
    oidcIssuer: "https://issuer.example.test/tenant",
    oidcOrganizationId: "redacted-organization-id",
  })
  expect("ZITADEL_ISSUER" in result.data).toBe(false)
})

test("conflicting provider-neutral and Zitadel values are rejected without exposing them", () => {
  const result = runtimeConfigurationParse({
    authMode: "oidc",
    databaseUrl: "postgres://redacted-user:redacted-password@codeline.test/codeline",
    nodeEnv: "production",
    oidcClientId: "generic-client-id",
    oidcIssuer: "https://generic-issuer.example.test",
    oidcOrganizationId: "generic-organization-id",
    OIDC_CLIENT_ID: "generic-client-id",
    OIDC_ORGANIZATION_ID: "generic-organization-id",
    ZITADEL_CLIENT_ID: "different-client-id",
    ZITADEL_ISSUER: "https://generic-issuer.example.test",
    publicOrigin: "https://codeline.example.test",
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("OIDC_CLIENT_ID")
  expect(result.errorMessage).toContain("ZITADEL_CLIENT_ID")
  expect(result.errorMessage).not.toContain("generic-client-id")
  expect(result.errorMessage).not.toContain("different-client-id")
  expect(result.errorMessage).not.toContain("redacted-password")
})

test("explicit callback validation requires HTTPS, no query or fragment, and the public origin", () => {
  const invalidCallbacks = [
    "http://codeline.example.test/login/zitadel/callback",
    "https://codeline.example.test/login/zitadel/callback?code=redacted",
    "https://codeline.example.test/login/zitadel/callback#fragment",
    "https://other.example.test/login/zitadel/callback",
  ]

  for (const OIDC_REDIRECT_URI of invalidCallbacks) {
    const result = runtimeConfigurationParse({
      AUTH_MODE: "oidc",
      OIDC_CLIENT_ID: "redacted-client-id",
      OIDC_ISSUER: "https://issuer.example.test",
      ZITADEL_ORGANIZATION_ID: "redacted-organization-id",
      OIDC_REDIRECT_URI,
      databaseUrl: "postgres://codeline.test/codeline",
      nodeEnv: "production",
      PUBLIC_ORIGIN: "https://codeline.example.test",
    })
    expect(result.success).toBe(false)
    if (result.success) continue
    expect(result.errorMessage).toContain("OIDC_REDIRECT_URI")
    expect(result.errorMessage).not.toContain("redacted")
  }
})

test("OIDC validation errors expose field names but not supplied values", () => {
  const result = runtimeConfigurationParse({
    authMode: "oidc",
    databaseUrl: "postgres://secret:password@127.0.0.1:6002/codeline",
    nodeEnv: "production",
    oidcClientId: "client-id-secret",
    oidcIssuer: "http://issuer-secret.example.test",
    oidcOrganizationId: "organization-secret",
    publicOrigin: "http://origin-secret.example.test",
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("PUBLIC_ORIGIN")
  expect(result.errorMessage).toContain("OIDC_ISSUER")
  expect(result.errorMessage).not.toContain("secret")
  expect(result.errorMessage).not.toContain("password")
})

test("server startup passes validated authentication configuration to the app boundary", async () => {
  const parsed = runtimeConfigurationParse({
    authMode: "oidc",
    databaseUrl: "postgres://codeline.test/codeline",
    nodeEnv: "production",
    oidcClientId: "client-id",
    oidcIssuer: "https://issuer.example.test",
    oidcOrganizationId: "organization-id",
    publicOrigin: "https://codeline.example.test",
  })
  if (!parsed.success) throw new Error(parsed.errorMessage)

  let receivedConfiguration: typeof parsed.data | undefined
  await serverStart({
    appCreate: (options) => {
      receivedConfiguration = options.configuration
      return appCreate()
    },
    configuration: parsed.data,
    configurationStore: {} as never,
    database: { client: { end: async () => undefined }, db: {} } as never,
    serve: () => ({ stop: async () => undefined, url: new URL("https://codeline.example.test") }),
    signalSource: { once: () => undefined, removeListener: () => undefined },
  })

  expect(receivedConfiguration?.authMode).toBe("oidc")
  expect(receivedConfiguration?.oidcCallbackUrl).toBe("https://codeline.example.test/api/auth/callback")
})
