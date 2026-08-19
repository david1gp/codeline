import { expect, test } from "bun:test"
import { projectAvatarColorResolve } from "./projectAvatarColorResolve.js"

test("projectAvatarColorResolve returns gray for an empty name", () => {
  expect(projectAvatarColorResolve("")).toEqual({
    key: "gray",
    background: "#71717a",
    foreground: "#ffffff",
  })
})

test("projectAvatarColorResolve returns the same color for the same name", () => {
  expect(projectAvatarColorResolve("Codeline")).toEqual(projectAvatarColorResolve("Codeline"))
})

test("projectAvatarColorResolve can return different colors for different names", () => {
  expect(projectAvatarColorResolve("Alpha")).not.toEqual(projectAvatarColorResolve("Beta"))
})
