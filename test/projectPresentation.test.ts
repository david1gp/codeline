import { expect, test } from "bun:test"
import { projectByteSizeFormat } from "../src/project/projectByteSizeFormat.js"
import { projectEntryAccessibleName } from "../src/project/projectEntryAccessibleName.js"
import { projectEntryPresentationClassify } from "../src/project/projectEntryPresentationClassify.js"
import { projectMimeTypeIsMarkdown } from "../src/project/projectMimeTypeIsMarkdown.js"
import { projectModifiedAtFormat } from "../src/project/projectModifiedAtFormat.js"

test("classifies folders and useful file families without treating unknown files as unsafe previews", () => {
  expect(projectEntryPresentationClassify({ name: "src", type: "directory" })).toEqual({
    label: "Folder",
    marker: "DIR",
  })
  expect(projectEntryPresentationClassify({ name: "README.MD", type: "file" })).toEqual({
    label: "Markdown",
    marker: "MD",
  })
  expect(projectEntryPresentationClassify({ name: "view.tsx", type: "file" })).toEqual({
    label: "TypeScript",
    marker: "TSX",
  })
  expect(projectEntryPresentationClassify({ name: "archive.bin", type: "file" })).toEqual({
    label: "File",
    marker: "FILE",
  })
  expect(projectEntryPresentationClassify({ name: "link", type: "other" })).toEqual({
    label: "Unavailable",
    marker: "--",
  })
})

test("formats byte sizes compactly and handles invalid metadata", () => {
  expect(projectByteSizeFormat(0)).toBe("0 B")
  expect(projectByteSizeFormat(999)).toBe("999 B")
  expect(projectByteSizeFormat(1500)).toBe("1.5 kB")
  expect(projectByteSizeFormat(2_400_000)).toBe("2.4 MB")
  expect(projectByteSizeFormat(-1)).toBe("Unknown size")
  expect(projectModifiedAtFormat("not-a-date")).toBe("Unknown date")
  expect(projectModifiedAtFormat("2026-08-13T00:00:00.000Z")).not.toBe("Unknown date")
})

test("builds action-oriented entry names without omitting visible metadata", () => {
  expect(
    projectEntryAccessibleName({
      name: "README.md",
      path: "README.md",
      type: "file",
      size: 1500,
      modifiedAt: "not-a-date",
    }),
  ).toBe("Open file README.md, Markdown, 1.5 kB, modified Unknown date")
  expect(
    projectEntryAccessibleName({
      name: "src",
      path: "src",
      type: "directory",
      size: 0,
      modifiedAt: "not-a-date",
    }),
  ).toBe("Open folder src, modified Unknown date")
})

test("recognizes Markdown MIME types with optional parameters", () => {
  expect(projectMimeTypeIsMarkdown("text/markdown")).toBe(true)
  expect(projectMimeTypeIsMarkdown("Text/Markdown; charset=utf-8")).toBe(true)
  expect(projectMimeTypeIsMarkdown("text/html; charset=utf-8")).toBe(false)
})
