import { expect, test } from "bun:test"
import { Hono } from "hono"
import type { AppEnvironment } from "../../../src/api/appEnvironment.js"
import { appCreate } from "../../../src/app/appCreate.js"
import { localAuthenticationMiddleware } from "../../../src/identity/api/localAuthenticationMiddleware.js"

const policy = { userId: "local:user", organizationId: "local:organization" }

function localAuthenticationAppCreate(
  options: {
    user?: { id: string; displayName: string }
    membership?: { userId: string; organizationId: string }
    failUser?: boolean
    failMembership?: boolean
    identity?: typeof policy
  } = {},
) {
  const database = {
    query: {
      applicationUserTable: {
        findFirst: async () => {
          if (options.failUser) throw new Error("user read failed")
          return options.user
        },
      },
      organizationMemberTable: {
        findFirst: async () => {
          if (options.failMembership) throw new Error("membership read failed")
          return options.membership
        },
      },
    },
  }
  const app = new Hono<AppEnvironment>()
  app.use("/api/*", localAuthenticationMiddleware(database as never, options.identity ?? policy))
  app.all("/api/protected", (context) => context.json(context.var.requestIdentity))
  app.get("/api/health", (context) => context.json({ status: "ok" }))
  app.get("/api/ready", (context) => context.json({ status: "ready" }))
  return app
}

test("local authentication snapshots the injected identity and ignores cookies, origins and impersonation headers", async () => {
  const identity = { ...policy }
  const app = localAuthenticationAppCreate({
    identity,
    user: { id: policy.userId, displayName: "Local User" },
    membership: policy,
  })
  identity.userId = "attacker"
  const response = await app.fetch(
    new Request("http://local.invalid/api/protected", {
      method: "POST",
      headers: {
        Cookie: "__Host-codeline-session=another-user",
        Origin: "https://attacker.test",
        "X-Codeline-User-Id": "another-user",
        "X-Codeline-Organization-Id": "another-organization",
      },
    }),
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ...policy, displayName: "Local User" })
  expect(response.headers.get("Set-Cookie")).toBeNull()
})

test("local authentication fails closed for missing, mismatched or unreadable persisted identity and membership", async () => {
  const user = { id: policy.userId, displayName: "Local User" }
  for (const options of [
    {},
    { user },
    { user, membership: { ...policy, organizationId: "other" } },
    { user, membership: { ...policy, userId: "other" } },
    { user: { ...user, id: "other" }, membership: policy },
    { user, membership: policy, failUser: true },
    { user, membership: policy, failMembership: true },
    { user, membership: policy, identity: { ...policy, userId: " " } },
  ]) {
    const response = await localAuthenticationAppCreate(options).fetch(
      new Request("http://local.invalid/api/protected"),
    )
    expect(response.status).toBe(401)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } })
  }
})

test("local health and readiness do not require an identity lookup", async () => {
  const app = localAuthenticationAppCreate({ failUser: true, failMembership: true })
  for (const path of ["/api/health", "/api/ready"])
    expect((await app.fetch(new Request(`http://local.invalid${path}`))).status).toBe(200)
})

test("partial application composition with a local policy never leaves project routes unauthenticated", async () => {
  const app = appCreate({ localIdentity: policy })
  expect((await app.fetch(new Request("http://local.invalid/api/project/list"))).status).toBe(401)
})
