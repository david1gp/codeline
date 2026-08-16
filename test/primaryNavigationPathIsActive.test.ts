import { expect, test } from "bun:test"
import { primaryNavigationPathIsActive } from "../src/ui/primaryNavigationPathIsActive.js"

test("primary navigation keeps Sessions active only on session routes", () => {
  expect(primaryNavigationPathIsActive("/", "/sessions/watched")).toBe(false)
  expect(primaryNavigationPathIsActive("/sessions", "/sessions/watched")).toBe(true)
  expect(primaryNavigationPathIsActive("/sessions/recent", "/sessions/watched")).toBe(true)
  expect(primaryNavigationPathIsActive("/sessions-archive", "/sessions/watched")).toBe(false)
})

test("primary navigation includes nested destination routes", () => {
  expect(primaryNavigationPathIsActive("/notes/new", "/notes")).toBe(true)
  expect(primaryNavigationPathIsActive("/", "/notes")).toBe(false)
})
