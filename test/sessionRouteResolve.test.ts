import { expect, test } from "bun:test"
import { sessionRouteResolve } from "../src/ui/sessionRouteResolve.js"

function routeCreate(pathname: string, search = "") {
  return sessionRouteResolve({ pathname, search })
}

test("session routes distinguish canonical selection, base, and new-session URLs", () => {
  expect(routeCreate("/sessions/selected", "?tab=watched")).toEqual({
    kind: "selected",
    sessionId: "selected",
    tab: "watched",
  })
  expect(routeCreate("/sessions", "?tab=projects")).toEqual({ kind: "base", sessionId: null, tab: "projects" })
  expect(routeCreate("/sessions/new", "?tab=search")).toEqual({ kind: "new", sessionId: null, tab: "search" })
})

test("session routes preserve legacy tab precedence and leave unknown IDs to session state", () => {
  expect(routeCreate("/sessions/projects", "?session=selected")).toEqual({
    kind: "legacy-tab",
    sessionId: "selected",
    tab: "projects",
  })
  expect(routeCreate("/sessions/projects", "?tab=watched&session=selected")).toEqual({
    kind: "legacy-tab",
    sessionId: "selected",
    tab: "watched",
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
