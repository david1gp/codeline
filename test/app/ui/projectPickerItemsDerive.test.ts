import { expect, test } from "bun:test"
import { filesProjectPickerItemsDerive } from "../../../src/project/ui/filesProjectPickerItemsDerive.js"
import { sessionProjectPickerItemsDerive } from "../../../src/session/ui/sessionProjectPickerItemsDerive.js"

test("files picker items retain project IDs and expose parent folders as paths", () => {
  expect(
    filesProjectPickerItemsDerive([
      { id: "project-a", label: "Alpha", parentFolder: { id: "folder", label: "Work" } },
      { id: "project-b", label: "Beta", parentFolder: null },
    ]),
  ).toEqual([
    {
      description: "Work",
      id: "project-a",
      keywords: ["Work"],
      label: "Alpha",
      project: { id: "project-a", label: "Alpha", parentFolder: { id: "folder", label: "Work" } },
    },
    {
      description: "Uncategorized",
      id: "project-b",
      keywords: undefined,
      label: "Beta",
      project: { id: "project-b", label: "Beta", parentFolder: null },
    },
  ])
})

test("session picker items retain unavailable projects as disabled entries and hide dot paths", () => {
  expect(
    sessionProjectPickerItemsDerive([
      { available: false, id: "missing", label: "Missing", parentFolder: null },
      { id: "hidden", label: ".private", parentFolder: null },
      { id: "visible", label: "Visible", parentFolder: { id: "folder", label: "Work" } },
    ]),
  ).toEqual([
    {
      description: "Uncategorized",
      disabled: true,
      disabledReason: "Unavailable",
      faviconUrl: undefined,
      id: "missing",
      keywords: undefined,
      label: "Missing",
    },
    {
      description: "Work",
      disabled: false,
      disabledReason: undefined,
      faviconUrl: undefined,
      id: "visible",
      keywords: ["Work"],
      label: "Visible",
    },
  ])
})
