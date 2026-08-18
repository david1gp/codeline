import { afterEach, expect, test } from "bun:test"
import { e2eEnvironmentAssertLocal } from "../scripts/e2eEnvironmentAssertLocal.js"

const guardedNames = [
  "DATABASE_URL",
  "NODE_ENV",
  "POSTGRES_DB",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "PUBLIC_ORIGIN",
  "ZITADEL_ISSUER",
  "ZITADEL_ORGANIZATION_ID",
] as const

const originalEnvironment = new Map(guardedNames.map((name) => [name, Bun.env[name]]))

function environmentApply(overrides: Partial<Record<(typeof guardedNames)[number], string | undefined>>): void {
  const values: Record<string, string | undefined> = {
    DATABASE_URL: "postgres://codeline:codeline@127.0.0.1:6002/codeline",
    NODE_ENV: "development",
    POSTGRES_DB: "codeline",
    POSTGRES_PORT: "6002",
    POSTGRES_USER: "codeline",
    PUBLIC_ORIGIN: "https://preview.codeline.work",
    ZITADEL_ISSUER: "https://issuer.example.test",
    ZITADEL_ORGANIZATION_ID: "contentoren-organization",
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

test("the local guard accepts every loopback address form of the managed database", () => {
  for (const host of ["127.0.0.1", "127.9.9.9", "localhost", "[::1]", "[0:0:0:0:0:0:0:1]"]) {
    environmentApply({ DATABASE_URL: `postgres://codeline:codeline@${host}:6002/codeline` })
    expect(e2eEnvironmentAssertLocal().success).toBe(true)
  }
})

test("the local guard rejects non-loopback and mismatched managed database targets", () => {
  const rejected = [
    "postgres://codeline:codeline@db.production.example:6002/codeline",
    "postgres://codeline:codeline@127.0.0.1.example.test:6002/codeline",
    "postgres://codeline:codeline@[2001:db8::1]:6002/codeline",
    "postgres://codeline:codeline@127.0.0.1:7002/codeline",
    "postgres://other:codeline@127.0.0.1:6002/codeline",
    "postgres://codeline:codeline@127.0.0.1:6002/other",
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

test("the local guard requires the issuer and organization identifiers from .env.example", () => {
  for (const name of ["ZITADEL_ISSUER", "ZITADEL_ORGANIZATION_ID"] as const) {
    environmentApply({ [name]: undefined })
    const result = e2eEnvironmentAssertLocal()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errorMessage).toContain(name)
  }
  environmentApply({ ZITADEL_ORGANIZATION_ID: "   " })
  expect(e2eEnvironmentAssertLocal().success).toBe(false)
})

test("the local guard requires the managed database credentials to compare against", () => {
  for (const name of ["POSTGRES_DB", "POSTGRES_PORT", "POSTGRES_USER", "DATABASE_URL"] as const) {
    environmentApply({ [name]: undefined })
    expect(e2eEnvironmentAssertLocal().success).toBe(false)
  }
})
