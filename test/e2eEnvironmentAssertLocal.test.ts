import { afterEach, expect, test } from "bun:test"
import { e2eEnvironmentAssertLocal } from "../scripts/e2eEnvironmentAssertLocal.js"
import { databasePath } from "../src/database/databasePath.js"

const guardedNames = [
  "DATABASE_URL",
  "NODE_ENV",
  "PUBLIC_ORIGIN",
  "OIDC_AUTHWORKS_ISSUER",
  "OIDC_AUTHWORKS_ORGANIZATION_ID",
  "OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID",
  "OIDC_ZITADEL_ISSUER",
  "OIDC_ZITADEL_ORGANIZATION_ID",
  "OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID",
  "OIDC_ISSUER",
  "OIDC_ORGANIZATION_ID",
  "OIDC_ALLOWED_ORGANIZATION_ID",
  "ZITADEL_ISSUER",
  "ZITADEL_ORGANIZATION_ID",
  "ZITADEL_ALLOWED_ORGANIZATION_ID",
] as const

const originalEnvironment = new Map(guardedNames.map((name) => [name, Bun.env[name]]))

function environmentApply(overrides: Partial<Record<(typeof guardedNames)[number], string | undefined>>): void {
  const values: Record<string, string | undefined> = {
    DATABASE_URL: `file:./${databasePath}`,
    NODE_ENV: "development",
    PUBLIC_ORIGIN: "https://preview.codeline.work",
    OIDC_AUTHWORKS_ISSUER: undefined,
    OIDC_AUTHWORKS_ORGANIZATION_ID: undefined,
    OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID: undefined,
    OIDC_ZITADEL_ISSUER: undefined,
    OIDC_ZITADEL_ORGANIZATION_ID: undefined,
    OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID: undefined,
    OIDC_ISSUER: undefined,
    OIDC_ORGANIZATION_ID: undefined,
    OIDC_ALLOWED_ORGANIZATION_ID: undefined,
    ZITADEL_ISSUER: "https://issuer.example.test",
    ZITADEL_ORGANIZATION_ID: "contentoren-organization",
    ZITADEL_ALLOWED_ORGANIZATION_ID: undefined,
    ...overrides,
  }
  for (const name of guardedNames) {
    const value = values[name]
    if (value === undefined) delete Bun.env[name]
    else Bun.env[name] = value
  }
}

afterEach(() => {
  for (const name of guardedNames) {
    const value = originalEnvironment.get(name)
    if (value === undefined) delete Bun.env[name]
    else Bun.env[name] = value
  }
})

test("the local guard accepts the repository-managed development environment", () => {
  environmentApply({})
  const result = e2eEnvironmentAssertLocal()
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.organizationExternalId).toBe("contentoren-organization")
  expect(result.data.publicOrigin).toBe("https://preview.codeline.work")
})

test("the local guard accepts relative and absolute forms of the managed SQLite database", () => {
  for (const databaseUrl of [
    `file:./${databasePath}`,
    `file:${databasePath}`,
    `file://${process.cwd()}/${databasePath}`,
  ]) {
    environmentApply({ DATABASE_URL: databaseUrl })
    expect(e2eEnvironmentAssertLocal().success).toBe(true)
  }
})

test("the local guard rejects non-SQLite and mismatched managed database targets", () => {
  const rejected = [
    "https://db.production.example/data.db",
    "file:./data/other.sqlite",
    "file:///tmp/codeline.sqlite",
    "not-a-connection-url",
  ]
  for (const databaseUrl of rejected) {
    environmentApply({ DATABASE_URL: databaseUrl })
    expect(e2eEnvironmentAssertLocal().success).toBe(false)
  }
})

test("the local guard rejects a non-development or non-preview environment", () => {
  environmentApply({ NODE_ENV: "production" })
  expect(e2eEnvironmentAssertLocal().success).toBe(false)
  environmentApply({ PUBLIC_ORIGIN: "https://codeline.example.test" })
  expect(e2eEnvironmentAssertLocal().success).toBe(false)
})

test("the local guard requires an issuer and shared organization identifier", () => {
  environmentApply({ ZITADEL_ISSUER: undefined })
  const issuerResult = e2eEnvironmentAssertLocal()
  expect(issuerResult.success).toBe(false)
  if (!issuerResult.success) expect(issuerResult.errorMessage).toContain("issuer")

  environmentApply({ ZITADEL_ORGANIZATION_ID: undefined })
  const organizationResult = e2eEnvironmentAssertLocal()
  expect(organizationResult.success).toBe(false)
  if (!organizationResult.success) expect(organizationResult.errorMessage).toContain("organization")

  environmentApply({ ZITADEL_ORGANIZATION_ID: "   " })
  expect(e2eEnvironmentAssertLocal().success).toBe(false)
})

test("the local guard resolves explicit provider namespaces and prefers Zitadel for deterministic fixtures", () => {
  environmentApply({
    OIDC_AUTHWORKS_ISSUER: "https://authworks.example.test",
    OIDC_AUTHWORKS_ORGANIZATION_ID: "contentoren-organization",
    OIDC_ZITADEL_ISSUER: "https://zitadel.example.test",
    OIDC_ZITADEL_ORGANIZATION_ID: "contentoren-organization",
    OIDC_ISSUER: undefined,
    OIDC_ORGANIZATION_ID: undefined,
    ZITADEL_ISSUER: undefined,
    ZITADEL_ORGANIZATION_ID: undefined,
  })

  const result = e2eEnvironmentAssertLocal()
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.issuer).toBe("https://zitadel.example.test")
  expect(result.data.organizationExternalId).toBe("contentoren-organization")
})

test("the local guard resolves Authworks when it is the only explicit provider", () => {
  environmentApply({
    OIDC_AUTHWORKS_ISSUER: "https://authworks.example.test",
    OIDC_AUTHWORKS_ORGANIZATION_ID: "contentoren-organization",
    OIDC_ZITADEL_ISSUER: undefined,
    OIDC_ZITADEL_ORGANIZATION_ID: undefined,
    OIDC_ISSUER: undefined,
    OIDC_ORGANIZATION_ID: undefined,
    ZITADEL_ISSUER: undefined,
    ZITADEL_ORGANIZATION_ID: undefined,
  })

  const result = e2eEnvironmentAssertLocal()
  expect(result.success).toBe(true)
  if (result.success) expect(result.data.issuer).toBe("https://authworks.example.test")
})

test("the local guard rejects conflicting shared organization IDs", () => {
  environmentApply({
    OIDC_AUTHWORKS_ISSUER: "https://authworks.example.test",
    OIDC_AUTHWORKS_ORGANIZATION_ID: "authworks-organization",
    OIDC_ZITADEL_ISSUER: "https://zitadel.example.test",
    OIDC_ZITADEL_ORGANIZATION_ID: "zitadel-organization",
    OIDC_ISSUER: undefined,
    OIDC_ORGANIZATION_ID: undefined,
    ZITADEL_ISSUER: undefined,
    ZITADEL_ORGANIZATION_ID: undefined,
  })

  const result = e2eEnvironmentAssertLocal()
  expect(result.success).toBe(false)
  if (!result.success) expect(result.errorMessage).toContain("differ")
})

test("the local guard maps distinct provider organization IDs to the configured local organization", () => {
  environmentApply({
    OIDC_AUTHWORKS_ISSUER: "https://authworks.example.test",
    OIDC_AUTHWORKS_ORGANIZATION_ID: "authworks-organization",
    OIDC_ZITADEL_ISSUER: "https://zitadel.example.test",
    OIDC_ZITADEL_ORGANIZATION_ID: "zitadel-organization",
    OIDC_ORGANIZATION_ID: "contentoren-organization",
    OIDC_ISSUER: undefined,
    ZITADEL_ISSUER: undefined,
    ZITADEL_ORGANIZATION_ID: undefined,
  })

  const result = e2eEnvironmentAssertLocal()
  expect(result.success).toBe(true)
  if (result.success) expect(result.data.organizationExternalId).toBe("contentoren-organization")
})

test("the local guard requires the managed database URL", () => {
  for (const name of ["DATABASE_URL"] as const) {
    environmentApply({ [name]: undefined })
    expect(e2eEnvironmentAssertLocal().success).toBe(false)
  }
})
