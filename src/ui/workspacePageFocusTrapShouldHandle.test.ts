import { expect, test } from "bun:test"
import { workspacePageFocusTrapShouldHandle } from "./workspacePageFocusTrapShouldHandle.js"

test("mobile drawer focus trap yields to unrelated active overlays", () => {
  expect(workspacePageFocusTrapShouldHandle(true, false)).toBe(false)
})

test("mobile drawer focus trap includes overlays owned by the drawer", () => {
  expect(workspacePageFocusTrapShouldHandle(true, true)).toBe(true)
  expect(workspacePageFocusTrapShouldHandle(false, false)).toBe(true)
})
