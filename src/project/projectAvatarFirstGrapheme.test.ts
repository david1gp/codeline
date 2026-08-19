import { expect, test } from "bun:test"
import { projectAvatarFirstGrapheme } from "./projectAvatarFirstGrapheme.js"

test("projectAvatarFirstGrapheme returns an empty string for an empty name", () => {
  expect(projectAvatarFirstGrapheme("")).toBe("")
})

test("projectAvatarFirstGrapheme returns the first ascii letter", () => {
  expect(projectAvatarFirstGrapheme("Codeline")).toBe("C")
})

test("projectAvatarFirstGrapheme keeps a multi-codepoint grapheme together", () => {
  expect(projectAvatarFirstGrapheme("👩‍💻 workspace")).toBe("👩‍💻")
})
