import { afterEach, expect, test } from "bun:test"
import { appCreate } from "../src/app/appCreate.js"
import { runtimeConfigurationParse } from "../src/configuration/runtimeConfigurationParse.js"
import type { RuntimeConfiguration } from "../src/configuration/runtimeConfigurationSchema.js"
import { serverStart } from "../src/server/serverStart.js"

const environmentNames = [
  "AUTH_MODE",
  "DATABASE_URL",
  "NODE_ENV",
  "OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID",
  "OIDC_AUTHWORKS_CALLBACK_URL",
  "OIDC_AUTHWORKS_CLIENT_ID",
  "OIDC_AUTHWORKS_CLIENT_SECRET",
  "OIDC_AUTHWORKS_ISSUER",
  "OIDC_AUTHWORKS_ORGANIZATION_ID",
  "OIDC_AUTHWORKS_REDIRECT_URI",
  "OIDC_ALLOWED_ORGANIZATION_ID",
  "OIDC_CALLBACK_URL",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_ISSUER",
  "OIDC_ORGANIZATION_ID",
  "OIDC_REDIRECT_URI",
  "OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID",
  "OIDC_ZITADEL_CALLBACK_URL",
  "OIDC_ZITADEL_CLIENT_ID",
  "OIDC_ZITADEL_CLIENT_SECRET",
  "OIDC_ZITADEL_ISSUER",
  "OIDC_ZITADEL_ORGANIZATION_ID",
  "OIDC_ZITADEL_REDIRECT_URI",
  "PUBLIC_ORIGIN",
  "SESSION_SECRET",
  "ZITADEL_CLIENT_ID",
  "ZITADEL_CLIENT_SECRET",
  "ZITADEL_ISSUER",
  "ZITADEL_ALLOWED_ORGANIZATION_ID",
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
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "test",
    publicOrigin: "http://localhost:6000",
  })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.oidcCallbackUrl).toBeUndefined()
})

test("development authentication normalizes every shared organization ID alias", () => {
  const aliases = [
    "OIDC_ORGANIZATION_ID",
    "OIDC_ALLOWED_ORGANIZATION_ID",
    "OIDC_AUTHWORKS_ORGANIZATION_ID",
    "OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID",
    "OIDC_ZITADEL_ORGANIZATION_ID",
    "OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID",
    "ZITADEL_ORGANIZATION_ID",
    "ZITADEL_ALLOWED_ORGANIZATION_ID",
  ] as const

  for (const alias of aliases) {
    const result = runtimeConfigurationParse({
      [alias]: "development-organization",
      AUTH_MODE: "development",
      databaseUrl: "file:./data/db.sqlite",
      nodeEnv: "test",
      publicOrigin: "http://localhost:6000",
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.oidcOrganizationId).toBe("development-organization")
  }
})

test("production startup fails closed without exposing OIDC values", async () => {
  Bun.env.AUTH_MODE = "development"
  Bun.env.DATABASE_URL = "file:./data/db.sqlite"
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
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "production",
    oidcClientId: "client-id-value",
    oidcIssuer: "https://issuer.example.test/tenant",
    oidcOrganizationId: "organization-id-value",
    publicOrigin: "https://codeline.example.test",
  })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.oidcCallbackUrl).toBe("https://codeline.example.test/api/auth/callback")
  expect(result.data.oidcProviders?.legacy).toMatchObject({
    callbackUrl: "https://codeline.example.test/api/auth/callback",
    clientId: "client-id-value",
    issuer: "https://issuer.example.test/tenant",
    organizationId: "organization-id-value",
  })
})

test("explicit Authworks and Zitadel namespaces normalize into shared provider configuration", () => {
  const result = runtimeConfigurationParse({
    AUTH_MODE: "oidc",
    OIDC_AUTHWORKS_CLIENT_ID: "authworks-client-id",
    OIDC_AUTHWORKS_CLIENT_SECRET: "authworks-client-secret",
    OIDC_AUTHWORKS_ISSUER: "https://authworks.example.test",
    OIDC_AUTHWORKS_ORGANIZATION_ID: "organization-id",
    OIDC_AUTHWORKS_REDIRECT_URI: "https://codeline.example.test/api/auth/callback",
    OIDC_ZITADEL_CLIENT_ID: "zitadel-client-id",
    OIDC_ZITADEL_CLIENT_SECRET: "zitadel-client-secret",
    OIDC_ZITADEL_ISSUER: "https://zitadel.example.test",
    OIDC_ZITADEL_ORGANIZATION_ID: "organization-id",
    OIDC_ZITADEL_REDIRECT_URI: "https://codeline.example.test/api/auth/callback",
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "production",
    PUBLIC_ORIGIN: "https://codeline.example.test",
  })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.oidcProviders).toEqual({
    authworks: {
      callbackUrl: "https://codeline.example.test/api/auth/callback",
      clientId: "authworks-client-id",
      clientSecret: "authworks-client-secret",
      issuer: "https://authworks.example.test",
      organizationId: "organization-id",
    },
    zitadel: {
      callbackUrl: "https://codeline.example.test/api/auth/callback",
      clientId: "zitadel-client-id",
      clientSecret: "zitadel-client-secret",
      issuer: "https://zitadel.example.test",
      organizationId: "organization-id",
    },
  })
  expect(result.data.oidcClientId).toBeUndefined()
  expect(result.data.oidcIssuer).toBeUndefined()
  expect(result.data.oidcOrganizationId).toBe("organization-id")
})

test("explicit providers reject equivalent issuer URLs without exposing credentials", () => {
  const result = runtimeConfigurationParse({
    AUTH_MODE: "oidc",
    OIDC_AUTHWORKS_CLIENT_ID: "authworks-client-id",
    OIDC_AUTHWORKS_CLIENT_SECRET: "authworks-client-secret",
    OIDC_AUTHWORKS_ISSUER: "https://issuer.example.test",
    OIDC_AUTHWORKS_ORGANIZATION_ID: "organization-id",
    OIDC_ZITADEL_CLIENT_ID: "zitadel-client-id",
    OIDC_ZITADEL_CLIENT_SECRET: "zitadel-client-secret",
    OIDC_ZITADEL_ISSUER: "https://issuer.example.test/",
    OIDC_ZITADEL_ORGANIZATION_ID: "organization-id",
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "production",
    PUBLIC_ORIGIN: "https://codeline.example.test",
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("OIDC_AUTHWORKS_ISSUER")
  expect(result.errorMessage).toContain("OIDC_ZITADEL_ISSUER")
  expect(result.errorMessage).not.toContain("authworks-client-secret")
  expect(result.errorMessage).not.toContain("zitadel-client-secret")
})

test("explicit providers must use the existing shared organization ID", () => {
  const result = runtimeConfigurationParse({
    AUTH_MODE: "oidc",
    OIDC_AUTHWORKS_CLIENT_ID: "authworks-client-id",
    OIDC_AUTHWORKS_ISSUER: "https://authworks.example.test",
    OIDC_AUTHWORKS_ORGANIZATION_ID: "authworks-organization-id",
    OIDC_ZITADEL_CLIENT_ID: "zitadel-client-id",
    OIDC_ZITADEL_ISSUER: "https://zitadel.example.test",
    OIDC_ZITADEL_ORGANIZATION_ID: "zitadel-organization-id",
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "production",
    PUBLIC_ORIGIN: "https://codeline.example.test",
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("OIDC_AUTHWORKS_ORGANIZATION_ID")
  expect(result.errorMessage).toContain("OIDC_ZITADEL_ORGANIZATION_ID")
  expect(result.errorMessage).not.toContain("authworks-organization-id")
  expect(result.errorMessage).not.toContain("zitadel-organization-id")
})

test("OIDC configuration preserves the issuer's root slash and path spelling", () => {
  for (const oidcIssuer of [
    "https://issuer.example.test",
    "https://issuer.example.test/",
    "https://issuer.example.test/tenant",
  ]) {
    const result = runtimeConfigurationParse({
      authMode: "oidc",
      databaseUrl: "file:./data/db.sqlite",
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

test("OIDC configuration requires the provider-neutral organization ID", () => {
  const result = runtimeConfigurationParse({
    authMode: "oidc",
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "production",
    oidcClientId: "client-id",
    oidcIssuer: "https://issuer.example.test",
    publicOrigin: "https://codeline.example.test",
  })

  expect(result.success).toBe(false)
  if (!result.success) expect(result.errorMessage).toContain("OIDC_ORGANIZATION_ID")
})

test("Zitadel aliases normalize to provider-neutral fields and preserve the provisioned callback path", () => {
  const result = runtimeConfigurationParse({
    AUTH_MODE: "oidc",
    ZITADEL_CLIENT_ID: "redacted-client-id",
    ZITADEL_CLIENT_SECRET: "redacted-client-secret",
    ZITADEL_ISSUER: "https://issuer.example.test/tenant",
    ZITADEL_ORGANIZATION_ID: "redacted-organization-id",
    ZITADEL_REDIRECT_URI: "https://codeline.example.test/login/zitadel/callback",
    databaseUrl: "file:./data/db.sqlite",
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
  expect(result.data.oidcProviders?.zitadel).toMatchObject({
    callbackUrl: "https://codeline.example.test/login/zitadel/callback",
    clientId: "redacted-client-id",
    clientSecret: "redacted-client-secret",
    issuer: "https://issuer.example.test/tenant",
    organizationId: "redacted-organization-id",
  })
  expect("ZITADEL_ISSUER" in result.data).toBe(false)
})

test("conflicting provider-neutral and Zitadel values are rejected without exposing them", () => {
  const result = runtimeConfigurationParse({
    authMode: "oidc",
    databaseUrl: "file:./data/db.sqlite",
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
      databaseUrl: "file:./data/db.sqlite",
      nodeEnv: "production",
      PUBLIC_ORIGIN: "https://codeline.example.test",
    })
    expect(result.success).toBe(false)
    if (result.success) continue
    expect(result.errorMessage).toContain("OIDC_REDIRECT_URI")
    expect(result.errorMessage).not.toContain("redacted")
  }
})

test("callback schema errors name the supplied callback aliases without exposing values", () => {
  for (const alias of ["OIDC_CALLBACK_URL", "OIDC_REDIRECT_URI"] as const) {
    const secret = `${alias}-secret`
    const result = runtimeConfigurationParse({
      AUTH_MODE: "oidc",
      OIDC_CLIENT_ID: "client-id",
      OIDC_ISSUER: "https://issuer.example.test",
      OIDC_ORGANIZATION_ID: "organization-id",
      [alias]: secret,
      databaseUrl: "file:./data/db.sqlite",
      nodeEnv: "production",
      PUBLIC_ORIGIN: "https://codeline.example.test",
    })

    expect(result.success).toBe(false)
    if (result.success) continue
    expect(result.errorMessage).toContain(alias)
    expect(result.errorMessage).not.toContain(secret)
    expect(result.errorMessage).not.toContain("callbackUrl")
    expect(result.errorMessage).not.toContain("oidcCallbackUrl")
  }
})

test("OIDC validation errors expose field names but not supplied values", () => {
  const result = runtimeConfigurationParse({
    authMode: "oidc",
    databaseUrl: "file:./data/db.sqlite",
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
    databaseUrl: "file:./data/db.sqlite",
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
    database: { client: { close: () => undefined }, db: {} } as never,
    runStartupInterruptionReconcile: async () => ({ success: true as const, data: { interruptedRunIds: [] } }),
    serve: () => ({ stop: async () => undefined, url: new URL("https://codeline.example.test") }),
    signalSource: { once: () => undefined, removeListener: () => undefined },
  })

  expect(receivedConfiguration?.authMode).toBe("oidc")
  expect(receivedConfiguration?.oidcCallbackUrl).toBe("https://codeline.example.test/api/auth/callback")
})

test("server startup forwards explicit provider namespaces into the validated configuration", async () => {
  for (const name of [
    "OIDC_CALLBACK_URL",
    "OIDC_CLIENT_ID",
    "OIDC_CLIENT_SECRET",
    "OIDC_ISSUER",
    "OIDC_ORGANIZATION_ID",
    "OIDC_REDIRECT_URI",
    "ZITADEL_CLIENT_ID",
    "ZITADEL_CLIENT_SECRET",
    "ZITADEL_ISSUER",
    "ZITADEL_ORGANIZATION_ID",
    "ZITADEL_REDIRECT_URI",
  ])
    delete Bun.env[name]
  Bun.env.AUTH_MODE = "oidc"
  Bun.env.NODE_ENV = "production"
  Bun.env.OIDC_AUTHWORKS_CLIENT_ID = "authworks-client-id"
  Bun.env.OIDC_AUTHWORKS_ISSUER = "https://authworks.example.test"
  Bun.env.OIDC_AUTHWORKS_ORGANIZATION_ID = "organization-id"
  Bun.env.OIDC_ZITADEL_CLIENT_ID = "zitadel-client-id"
  Bun.env.OIDC_ZITADEL_ISSUER = "https://zitadel.example.test"
  Bun.env.OIDC_ZITADEL_ORGANIZATION_ID = "organization-id"
  Bun.env.PUBLIC_ORIGIN = "https://codeline.example.test"
  Bun.env.SESSION_SECRET = "test-session-secret"

  let receivedConfiguration: RuntimeConfiguration | undefined
  await serverStart({
    appCreate: (options) => {
      receivedConfiguration = options.configuration
      return appCreate()
    },
    configurationStore: {} as never,
    database: { client: { close: () => undefined }, db: {} } as never,
    projectRootDirs: [],
    providerAgentCatalog: {} as never,
    runStartupInterruptionReconcile: async () => ({ success: true as const, data: { interruptedRunIds: [] } }),
    serve: () => ({ stop: async () => undefined, url: new URL("https://codeline.example.test") }),
    signalSource: { once: () => undefined, removeListener: () => undefined },
  })

  expect(receivedConfiguration?.oidcProviders).toMatchObject({
    authworks: { clientId: "authworks-client-id", issuer: "https://authworks.example.test" },
    zitadel: { clientId: "zitadel-client-id", issuer: "https://zitadel.example.test" },
  })
})
