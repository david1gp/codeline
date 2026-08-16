import { expect, test } from "bun:test"
import { sessionSidebarDestinationResolve } from "../src/ui/sessionSidebarDestinationResolve.js"

function storageCreate(value: string | null) {
  return { getItem: () => value }
}

test("session navigation resolves the current or remembered validated sidebar tab", () => {
  expect(sessionSidebarDestinationResolve("/sessions/projects", storageCreate("watched"))).toBe("/sessions/projects")
  expect(
    sessionSidebarDestinationResolve("/sessions/projects?session=selected&search=term#chat", storageCreate("watched")),
  ).toBe("/sessions/projects?session=selected#chat")
  expect(sessionSidebarDestinationResolve("/sessions/search?search=term#chat", storageCreate("watched"))).toBe(
    "/sessions/search?search=term#chat",
  )
  expect(sessionSidebarDestinationResolve("/", storageCreate("watched"))).toBe("/sessions/watched")
  expect(sessionSidebarDestinationResolve("/?search=term#chat", storageCreate("not-a-tab"))).toBe(
    "/sessions/recent#chat",
  )
  expect(sessionSidebarDestinationResolve("/", null)).toBe("/sessions/recent")
})
