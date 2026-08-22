import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { identityActionOrganizationOwnsRequire } from "../src/identity/convex/identityActionOrganizationOwnsRequire.js"
import { identityActionUserOwnsRequire } from "../src/identity/convex/identityActionUserOwnsRequire.js"
import { identityHttpUserOwnsRequire } from "../src/identity/convex/identityHttpUserOwnsRequire.js"
import { identitySecretHash } from "../src/identity/convex/identitySecretHash.js"
import { identitySessionTokenRead } from "../src/identity/convex/identitySessionTokenRead.js"

test("Convex identity secrets are one-way and stable", async () => {
  const first = await identitySecretHash("opaque-session")
  const second = await identitySecretHash("opaque-session")

  expect(first).toBe(second)
  expect(first).not.toBe("opaque-session")
  expect(first).toHaveLength(64)
})

test("Convex HTTP identity resolution reads only the host session cookie", () => {
  const request = new Request("https://codeline.test", {
    headers: { Cookie: "other=value; __Host-codeline-session=opaque%2Dsession" },
  })

  expect(identitySessionTokenRead(request)).toBe("opaque-session")
  expect(identitySessionTokenRead(new Request("https://codeline.test"))).toBeUndefined()
  expect(
    identitySessionTokenRead(
      new Request("https://codeline.test", { headers: { Cookie: "__Host-codeline-session=%E0%A4%A" } }),
    ),
  ).toBeUndefined()
})

test("action and HTTP user ownership guards compare against the trusted session", async () => {
  const runQuery = async () =>
    createResult({
      sessionId: "session-id",
      user: { createdAt: 1, displayName: "User", id: "user-id", updatedAt: 1 },
      userId: "user-id",
    })

  expect((await identityActionUserOwnsRequire({ runQuery }, "opaque-session", "user-id")).success).toBe(true)
  expect((await identityActionUserOwnsRequire({ runQuery }, "opaque-session", "attacker-id")).success).toBe(false)
  expect(
    (
      await identityHttpUserOwnsRequire(
        { runQuery },
        new Request("https://codeline.test", { headers: { Cookie: "__Host-codeline-session=opaque-session" } }),
        "user-id",
      )
    ).success,
  ).toBe(true)
})

test("action organization ownership guards never accept a client user id", async () => {
  const runQuery = async () => createResult(undefined)
  const result = await identityActionOrganizationOwnsRequire({ runQuery }, "opaque-session", "organization-id")

  expect(result.success).toBe(true)
})
