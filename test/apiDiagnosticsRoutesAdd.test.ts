import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiClientLogRequestSchema } from "../src/api/diagnostics/apiClientLogRequestSchema.js"
import { apiClientLogSanitize } from "../src/api/diagnostics/apiClientLogSanitize.js"
import { apiDiagnosticsLimits } from "../src/api/diagnostics/apiDiagnosticsLimits.js"
import { apiDiagnosticsRoutesAdd } from "../src/api/diagnostics/apiDiagnosticsRoutesAdd.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { appCreate } from "../src/app/appCreate.js"

test("client log ingestion requires authentication", async () => {
  const app = new Hono<AppEnvironment>()
  apiDiagnosticsRoutesAdd(app)

  const response = await app.request("https://codeline.test/diagnostics/logs", {
    body: JSON.stringify({ logs: [{ level: "error", message: "not accepted" }] }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(401)
  expect(v.safeParse(apiErrorResponseSchema, await response.json()).success).toBe(true)
})

test("client log ingestion accepts a bounded batch and writes sanitized structured entries", async () => {
  const entries: unknown[] = []
  const app = authenticatedDiagnosticsApp((entry) => entries.push(entry))
  const response = await app.request("https://codeline.test/diagnostics/logs", {
    body: JSON.stringify({
      logs: [
        {
          data: {
            authorization: "Bearer do-not-write-this",
            body: "request-body-do-not-write-this",
            nested: { url: "/private?token=do-not-write-this#fragment" },
          },
          level: "error",
          message:
            "fetch https://api.test/private?token=do-not-write-this#fragment /private?token=do-not-write-this#fragment Bearer do-not-write-this",
          source: "browser",
          url: "https://codeline.test/sessions?session=do-not-write-this#private",
        },
        { level: "info", message: "second entry" },
      ],
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(200)
  expect(
    v.safeParse(apiClientLogRequestSchema, {
      logs: [{ level: "info", message: "schema check" }],
    }).success,
  ).toBe(true)
  expect(await response.json()).toEqual({ accepted: 2 })
  expect(entries).toHaveLength(2)
  const output = JSON.stringify(entries)
  expect(output).not.toContain("do-not-write-this")
  expect(output).not.toContain("fragment")
  expect(output).not.toContain("?")
  expect(output).toContain("https://api.test/private")
  expect(output).toContain("https://codeline.test/sessions")
})

test("client log ingestion rejects invalid strict and oversized requests", async () => {
  const app = authenticatedDiagnosticsApp()
  const requests = [
    { logs: [] },
    { logs: [{ extra: true, level: "error", message: "unknown field" }] },
    { logs: [{ level: "error", message: "x".repeat(apiDiagnosticsLimits.maxMessageLength + 1) }] },
    {
      logs: Array.from({ length: apiDiagnosticsLimits.maxBatchSize + 1 }, () => ({
        level: "info",
        message: "too many",
      })),
    },
  ]

  for (const body of requests) {
    const response = await app.request("https://codeline.test/diagnostics/logs", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(response.status).toBe(400)
    expect(v.safeParse(apiErrorResponseSchema, await response.json()).success).toBe(true)
  }

  const oversized = await app.request("https://codeline.test/diagnostics/logs", {
    body: new Uint8Array(apiDiagnosticsLimits.maxBodyBytes + 1),
    method: "POST",
  })
  expect(oversized.status).toBe(400)
})

test("client log ingestion is protected by the configured same-origin authentication check", async () => {
  const app = authenticatedOriginDiagnosticsApp()
  const request = {
    body: JSON.stringify({ logs: [{ level: "error", message: "origin check" }] }),
    headers: {
      Cookie: "__Host-codeline-session=opaque-session",
      Host: "codeline.test",
      Origin: "https://codeline.test",
      "Content-Type": "application/json",
    },
    method: "POST",
  } as const

  expect((await app.request("https://codeline.test/api/diagnostics/logs", request)).status).toBe(200)
  expect(
    (
      await app.request("https://codeline.test/api/diagnostics/logs", {
        ...request,
        headers: { ...request.headers, Origin: "https://attacker.test" },
      })
    ).status,
  ).toBe(403)
})

test("client log sanitization terminates on circular structured values", () => {
  const value: Record<string, unknown> = { message: "safe" }
  value.self = value

  const sanitized = apiClientLogSanitize(value)
  expect(JSON.stringify(sanitized)).toContain("[CIRCULAR]")
})

function authenticatedDiagnosticsApp(
  clientLogJournalWrite: (entry: unknown) => void = () => undefined,
): Hono<AppEnvironment> {
  const app = new Hono<AppEnvironment>()
  app.use("*", (context, next) => {
    context.set("requestIdentity", { organizationId: "organization-1", userId: "user-1" })
    return next()
  })
  apiDiagnosticsRoutesAdd(app, { clientLogJournalWrite })
  return app
}

function authenticatedOriginDiagnosticsApp(): ReturnType<typeof appCreate> {
  return appCreate({
    clientLogJournalWrite: () => undefined,
    configuration: {
      authMode: "oidc",
      databaseUrl: "file:./data/db.sqlite",
      nodeEnv: "test",
      oidcClientId: "client",
      oidcIssuer: "https://issuer.codeline.test",
      oidcOrganizationId: "organization-external-1",
      publicOrigin: "https://codeline.test",
    },
    database: {} as never,
    identitySessionLoad: async () =>
      createResult({
        createdAt: new Date("2026-08-27T00:00:00.000Z"),
        expiresAt: new Date("2026-08-28T00:00:00.000Z"),
        id: "session-1",
        lastUsedAt: null,
        revokedAt: null,
        tokenHash: "not-used",
        userId: "user-1",
      } as never),
    organizationMemberLoad: async () =>
      createResult({
        issuer: "https://issuer.codeline.test/",
        organizationId: "organization-1",
        subject: "subject-1",
        userId: "user-1",
      } as never),
  })
}
