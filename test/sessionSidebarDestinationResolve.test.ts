import { expect, test } from "bun:test"
import { sessionSidebarDestinationResolve } from "../src/ui/sessionSidebarDestinationResolve.js"

function storageCreate(value: string | null) {
  return { getItem: () => value }
}

test("session navigation resolves the current or remembered validated sidebar tab", () => {
  expect(sessionSidebarDestinationResolve("/sessions/projects", storageCreate("watched"))).toBe(
    "/sessions?tab=projects",
  )
  expect(
    sessionSidebarDestinationResolve("/sessions/projects?session=selected&search=term#chat", storageCreate("watched")),
  ).toBe("/sessions/selected?tab=projects#chat")
  expect(sessionSidebarDestinationResolve("/sessions/search?search=term#chat", storageCreate("watched"))).toBe(
    "/sessions?tab=search&search=term#chat",
  )
  expect(sessionSidebarDestinationResolve("/sessions/session-1?tab=watched", storageCreate("recent"))).toBe(
    "/sessions/session-1?tab=watched",
  )
  expect(sessionSidebarDestinationResolve("/sessions/recent?tab=watched", storageCreate("projects"))).toBe(
    "/sessions/recent?tab=watched",
  )
  expect(sessionSidebarDestinationResolve("/sessions/new", storageCreate("projects"))).toBe(
    "/sessions/new?tab=projects",
  )
  expect(sessionSidebarDestinationResolve("/", storageCreate("watched"))).toBe("/sessions?tab=watched")
  expect(sessionSidebarDestinationResolve("/?search=term#chat", storageCreate("not-a-tab"))).toBe(
    "/sessions?tab=recent#chat",
  )
  expect(sessionSidebarDestinationResolve("/", null)).toBe("/sessions?tab=recent")
})
