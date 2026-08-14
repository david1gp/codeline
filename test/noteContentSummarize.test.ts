import { expect, test } from "bun:test"
import { noteContentSummarize } from "../src/note/ui/noteContentSummarize.js"
import { noteLineCount } from "../src/note/ui/noteLineCount.js"

test("note summaries use the first line as the heading and exclude it from the preview", () => {
  expect(noteContentSummarize("  Heading  \nDetail one\nDetail two")).toEqual({
    heading: "Heading",
    preview: "Detail one\nDetail two",
  })
  expect(noteContentSummarize("\nDetails")).toEqual({ heading: "Untitled note", preview: "Details" })
})

test("note line counts include trailing lines and normalize Windows line endings", () => {
  expect(noteLineCount("")).toBe(0)
  expect(noteLineCount("one")).toBe(1)
  expect(noteLineCount("one\r\ntwo\r\n")).toBe(3)
})
