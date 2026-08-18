import { expect, test } from "bun:test"
import { sessionSidebarDestinationResolve } from "../src/ui/sessionSidebarDestinationResolve.js"

function storageCreate(value: string | null) {
  return { getItem: () => value }
}

test("session navigation resolves the current or remembered validated sidebar tab", () => {
  expect(sessionSidebarDestinationResolve("/sessions/projects", storageCreate("pinned"))).toBe("/sessions?tab=projects")
  expect(
    sessionSidebarDestinationResolve("/sessions/projects?session=selected&search=term#chat", storageCreate("pinned")),
  ).toBe("/sessions/selected?tab=projects#chat")
  expect(sessionSidebarDestinationResolve("/sessions/search?search=term#chat", storageCreate("pinned"))).toBe(
    "/sessions?tab=search&search=term#chat",
  )
  expect(sessionSidebarDestinationResolve("/sessions/session-1?tab=pinned", storageCreate("recent"))).toBe(
    "/sessions/session-1?tab=pinned",
  )
  expect(sessionSidebarDestinationResolve("/sessions/recent?tab=pinned", storageCreate("projects"))).toBe(
    "/sessions/recent?tab=pinned",
  )
  expect(sessionSidebarDestinationResolve("/sessions/new", storageCreate("projects"))).toBe(
    "/sessions/new?tab=projects",
  )
  expect(sessionSidebarDestinationResolve("/sessions?tab=projects", storageCreate("pinned"))).toBe(
    "/sessions?tab=projects",
  )
  expect(sessionSidebarDestinationResolve("/sessions/new?tab=pinned", storageCreate("projects"))).toBe(
    "/sessions/new?tab=pinned",
  )
  expect(sessionSidebarDestinationResolve("/sessions/selected?tab=projects", storageCreate("pinned"))).toBe(
    "/sessions/selected?tab=projects",
  )
  expect(sessionSidebarDestinationResolve("/sessions/search?session=selected&search=term#chat", null)).toBe(
    "/sessions/selected?tab=search&search=term#chat",
  )
  expect(sessionSidebarDestinationResolve("/", storageCreate("pinned"))).toBe("/sessions?tab=pinned")
  expect(sessionSidebarDestinationResolve("/?search=term#chat", storageCreate("not-a-tab"))).toBe(
    "/sessions?tab=recent#chat",
  )
  expect(sessionSidebarDestinationResolve("/", null)).toBe("/sessions?tab=recent")
})
