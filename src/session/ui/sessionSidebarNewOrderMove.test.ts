import { expect, test } from "bun:test"
import { sessionSidebarNewOrderMove } from "./sessionSidebarNewOrderMove.js"

test("moving a visible row reorders it and keeps saved-but-unloaded rows", () => {
  expect(sessionSidebarNewOrderMove(["one", "two", "three"], ["one", "two", "three", "later"], "three", "one")).toEqual(
    ["three", "one", "two", "later"],
  )
})

test("moving an unknown row or dropping onto itself leaves saved order unchanged", () => {
  expect(sessionSidebarNewOrderMove(["one", "two"], ["two", "one", "later"], "missing", "one")).toEqual([
    "two",
    "one",
    "later",
  ])
  expect(sessionSidebarNewOrderMove(["one", "two"], ["two", "one", "later"], "one", "one")).toEqual([
    "two",
    "one",
    "later",
  ])
})
