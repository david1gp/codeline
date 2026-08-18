import { expect, test } from "bun:test"
import { primaryNavigationPathIsActive } from "../src/ui/primaryNavigationPathIsActive.js"

test("primary navigation keeps Sessions active only on session routes", () => {
  expect(primaryNavigationPathIsActive("/", "/sessions/pinned")).toBe(false)
  expect(primaryNavigationPathIsActive("/sessions", "/sessions/pinned")).toBe(true)
  expect(primaryNavigationPathIsActive("/sessions/recent", "/sessions/pinned")).toBe(true)
  expect(primaryNavigationPathIsActive("/sessions-archive", "/sessions/pinned")).toBe(false)
})

test("primary navigation includes nested destination routes", () => {
  expect(primaryNavigationPathIsActive("/notes/new", "/notes")).toBe(true)
  expect(primaryNavigationPathIsActive("/", "/notes")).toBe(false)
})
