import { expect, test } from "bun:test"
import { sessionLastActiveAccountRead } from "../src/session/client/sessionLastActiveAccountRead.js"
import { sessionLastActiveAccountWrite } from "../src/session/client/sessionLastActiveAccountWrite.js"
import { sessionReadOnlyNoticeResolve } from "../src/session/client/sessionReadOnlyNoticeResolve.js"
import { sessionReadOnlyReasonResolve } from "../src/session/client/sessionReadOnlyReasonResolve.js"
import { signedOutCachedBrowsingResolve } from "../src/ui/signedOutCachedBrowsingResolve.js"

const signedInOnline = {
  cacheStatus: "ready" as const,
  hasCachedSnapshot: true,
  hasLiveSession: true,
  isOnline: true,
  isSignedIn: true,
}

test("an authoritative online read stays editable", () => {
  expect(sessionReadOnlyReasonResolve(signedInOnline)).toBeNull()
})

test("a signed-out reader with a cached record browses read-only", () => {
  expect(sessionReadOnlyReasonResolve({ ...signedInOnline, hasLiveSession: false, isSignedIn: false })).toBe(
    "signed-out",
  )
})

test("a signed-out reader without a cached record is not granted cached browsing", () => {
  expect(
    sessionReadOnlyReasonResolve({
      ...signedInOnline,
      hasCachedSnapshot: false,
      hasLiveSession: false,
      isSignedIn: false,
    }),
  ).toBeNull()
})

test("an offline signed-in reader is read-only even with a live representation", () => {
  expect(sessionReadOnlyReasonResolve({ ...signedInOnline, isOnline: false })).toBe("offline")
})

test("a cached record shown while revalidating or after a failure is stale and read-only", () => {
  expect(sessionReadOnlyReasonResolve({ ...signedInOnline, cacheStatus: "revalidating", hasLiveSession: false })).toBe(
    "stale",
  )
  expect(sessionReadOnlyReasonResolve({ ...signedInOnline, cacheStatus: "error", hasLiveSession: false })).toBe("stale")
})

test("every read-only reason has a distinct notice", () => {
  const notices = (["offline", "signed-out", "stale"] as const).map(sessionReadOnlyNoticeResolve)
  expect(new Set(notices).size).toBe(3)
  for (const notice of notices) expect(notice.length).toBeGreaterThan(0)
})

test("signed-out cached browsing is limited to session routes of a known last account", () => {
  expect(signedOutCachedBrowsingResolve({ pathname: "/sessions/session-a", search: "" }, "user-a")).toBe(true)
  expect(signedOutCachedBrowsingResolve({ pathname: "/sessions/session-a", search: "" }, null)).toBe(false)
  expect(signedOutCachedBrowsingResolve({ pathname: "/notes", search: "" }, "user-a")).toBe(false)
  expect(signedOutCachedBrowsingResolve({ pathname: "/sessions/new", search: "" }, "user-a")).toBe(false)
})

test("the last locally active account round-trips through storage and rejects invalid values", async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }

  // The write is deferred to an idle frame so it never blocks rendering.
  sessionLastActiveAccountWrite("user-a", storage)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(sessionLastActiveAccountRead(storage)).toBe("user-a")

  sessionLastActiveAccountWrite("", storage)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(sessionLastActiveAccountRead(storage)).toBe("user-a")

  values.set("codeline-last-active-account", "")
  expect(sessionLastActiveAccountRead(storage)).toBeNull()
  expect(sessionLastActiveAccountRead({ getItem: () => null })).toBeNull()
})
