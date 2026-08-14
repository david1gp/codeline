import { expect, test } from "bun:test"
import { oidcCallbackPathResolve } from "../src/configuration/oidcCallbackPathResolve.js"
import { oidcCallbackProxyContextResolve } from "../src/configuration/oidcCallbackProxyContextResolve.js"
import { oidcCallbackRequestUrlResolve } from "../src/configuration/oidcCallbackRequestUrlResolve.js"

const publicOrigin = "https://codeline.example.test"

test("resolves the generic OIDC callback URL to its pathname", () => {
  expect(
    oidcCallbackPathResolve({
      OIDC_CALLBACK_URL: `${publicOrigin}/login/custom/callback`,
      PUBLIC_ORIGIN: publicOrigin,
    }),
  ).toBe("/login/custom/callback")
})

test("resolves the provisioned Zitadel callback URL to its pathname", () => {
  expect(
    oidcCallbackPathResolve({
      PUBLIC_ORIGIN: publicOrigin,
      ZITADEL_REDIRECT_URI: `${publicOrigin}/login/zitadel/callback`,
    }),
  ).toBe("/login/zitadel/callback")
})

test("uses the provider-neutral default callback path", () => {
  expect(oidcCallbackPathResolve({ PUBLIC_ORIGIN: publicOrigin })).toBe("/api/auth/callback")
})

test("rejects invalid, cross-origin, and UI callback URLs without returning their values", () => {
  const invalidValues = [
    "/login/zitadel/callback",
    "https://other.example.test/login/zitadel/callback",
    `${publicOrigin}/login/zitadel/callback?code=redacted`,
    `${publicOrigin}/login/zitadel/callback#fragment`,
    `https://user:password@codeline.example.test/login/zitadel/callback`,
    `${publicOrigin}/`,
    `${publicOrigin}/login`,
  ]

  for (const OIDC_CALLBACK_URL of invalidValues) {
    expect(oidcCallbackPathResolve({ OIDC_CALLBACK_URL, PUBLIC_ORIGIN: publicOrigin })).toBeUndefined()
  }
})

test("rejects conflicting callback environment aliases without selecting one", () => {
  expect(
    oidcCallbackPathResolve({
      OIDC_CALLBACK_URL: `${publicOrigin}/login/generic/callback`,
      PUBLIC_ORIGIN: publicOrigin,
      ZITADEL_REDIRECT_URI: `${publicOrigin}/login/zitadel/callback`,
    }),
  ).toBeUndefined()
})

test("matches only the exact callback pathname, allowing callback query parameters", () => {
  const matcher = new RegExp(oidcCallbackProxyContextResolve("/login/zitadel/callback"))

  expect(matcher.test("/login/zitadel/callback")).toBe(true)
  expect(matcher.test("/login/zitadel/callback?code=opaque&state=opaque")).toBe(true)
  expect(matcher.test("/login/zitadel/callback/extra")).toBe(false)
  expect(matcher.test("/login/zitadel/callback-extra")).toBe(false)
  expect(matcher.test("/login/zitadel/callback-other?state=opaque")).toBe(false)
})

test("constructs the external callback URL from the configured origin and request path/query", () => {
  const callback = oidcCallbackRequestUrlResolve(
    new URL(`${publicOrigin}/login/zitadel/callback`),
    new URL("http://127.0.0.1:6001/login/zitadel/callback?code=opaque%2Bvalue&state=opaque"),
  )

  expect(callback.toString()).toBe(
    "https://codeline.example.test/login/zitadel/callback?code=opaque%2Bvalue&state=opaque",
  )
  expect(callback.pathname).toBe("/login/zitadel/callback")
})

test("does not allow a request pathname to replace the configured callback authority", () => {
  const callback = oidcCallbackRequestUrlResolve(
    new URL(`${publicOrigin}/login/zitadel/callback`),
    new URL("http://127.0.0.1:6001//attacker.example.test/login/zitadel/callback?state=opaque"),
  )

  expect(callback.origin).toBe(publicOrigin)
  expect(callback.pathname).toBe("//attacker.example.test/login/zitadel/callback")
})

test("keeps a wrong request path distinct from the exact configured callback path", () => {
  const callback = oidcCallbackRequestUrlResolve(
    new URL(`${publicOrigin}/login/zitadel/callback`),
    new URL("http://127.0.0.1:6001/login/zitadel/callback-extra?state=opaque"),
  )

  expect(callback.pathname).not.toBe("/login/zitadel/callback")
})
