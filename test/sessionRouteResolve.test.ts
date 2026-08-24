import { expect, test } from "bun:test"
import { sessionRouteResolve } from "../src/ui/sessionRouteResolve.js"

function routeCreate(pathname: string, search = "") {
  return sessionRouteResolve({ pathname, search })
}

test("session routes distinguish canonical selection, base, and new-session URLs", () => {
  expect(routeCreate("/sessions/selected", "?tab=pinned")).toEqual({
    kind: "selected",
    sessionId: "selected",
    tab: "pinned",
  })
  expect(routeCreate("/sessions", "?tab=projects")).toEqual({ kind: "base", sessionId: null, tab: "projects" })
  expect(routeCreate("/sessions/new", "?tab=search")).toEqual({ kind: "new", sessionId: null, tab: "search" })
})

test("session routes treat every path segment as a session ID and leave unknown IDs to session state", () => {
  expect(routeCreate("/sessions/projects")).toEqual({
    kind: "selected",
    sessionId: "projects",
    tab: null,
  })
  expect(routeCreate("/sessions/projects", "?tab=pinned")).toEqual({
    kind: "selected",
    sessionId: "projects",
    tab: "pinned",
  })
  expect(routeCreate("/sessions/unknown-id", "?tab=recent")).toEqual({
    kind: "selected",
    sessionId: "unknown-id",
    tab: "recent",
  })
})

test("session routes reject malformed paths and invalid tabs fall back", () => {
  expect(routeCreate("/sessions/a/b")).toEqual({ kind: "invalid", sessionId: null, tab: null })
  expect(routeCreate("/sessions/recent/extra")).toEqual({ kind: "invalid", sessionId: null, tab: null })
  expect(routeCreate("/sessions/selected", "?tab=not-a-tab")).toEqual({
    kind: "selected",
    sessionId: "selected",
    tab: null,
  })
  expect(routeCreate("/sessions/")).toEqual({ kind: "base", sessionId: null, tab: null })
})
