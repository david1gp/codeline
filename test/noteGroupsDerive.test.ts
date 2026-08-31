import { expect, test } from "bun:test"
import { noteGroupsDerive } from "../src/note/ui/noteGroupsDerive.js"

test("note groups use registered labels without changing group or note ordering", () => {
  const notes = [
    { id: "unassigned", content: "unassigned", projectId: null, projectPath: null, sortOrder: 0, updatedAt: 1 },
    {
      id: "legacy",
      content: "legacy",
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc7",
      projectPath: "packages/legacy",
      sortOrder: 0,
      updatedAt: 2,
    },
    {
      id: "opaque",
      content: "opaque",
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb8",
      projectPath: "/workspace/codeline",
      sortOrder: 1,
      updatedAt: 3,
    },
    {
      id: "opaque-first",
      content: "first",
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb8",
      projectPath: "/workspace/codeline",
      sortOrder: 0,
      updatedAt: 4,
    },
    {
      id: "unavailable",
      content: "unavailable",
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb9",
      projectPath: "/workspace/unavailable",
      sortOrder: 0,
      updatedAt: 5,
    },
  ]

  const [unassignedNote, legacyNote, opaqueNote, firstNote, unavailableNote] = notes

  expect(
    noteGroupsDerive(notes, [
      {
        available: true,
        faviconUrl: "/api/project/favicon/codeline?revision=1",
        id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb8",
        label: "Codeline",
        parentFolder: null,
      },
      {
        available: false,
        faviconUrl: null,
        id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb9",
        label: "Unavailable Project",
        parentFolder: null,
      },
    ]),
  ).toEqual([
    {
      faviconUrl: "/api/project/favicon/codeline?revision=1",
      label: "Codeline",
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb8",
      projectPath: "/workspace/codeline",
      notes: [firstNote!, opaqueNote!],
    },
    {
      faviconUrl: null,
      label: "Unavailable Project",
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb9",
      projectPath: "/workspace/unavailable",
      notes: [unavailableNote!],
    },
    {
      faviconUrl: null,
      label: "packages/legacy",
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc7",
      projectPath: "packages/legacy",
      notes: [legacyNote!],
    },
    {
      faviconUrl: null,
      label: "Unassigned",
      projectId: null,
      projectPath: null,
      notes: [unassignedNote!],
    },
  ])
})

test("note groups keep duplicate project labels separate by opaque project ID", () => {
  const firstProjectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fba"
  const secondProjectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fbb"
  const firstNote = {
    content: "first",
    id: "first",
    projectId: firstProjectId,
    projectPath: "/workspace/first",
    updatedAt: 1,
  }
  const secondNote = {
    content: "second",
    id: "second",
    projectId: secondProjectId,
    projectPath: "/workspace/second",
    updatedAt: 1,
  }

  expect(
    noteGroupsDerive(
      [firstNote, secondNote],
      [
        { available: true, faviconUrl: null, id: firstProjectId, label: "Shared label", parentFolder: null },
        { available: true, faviconUrl: null, id: secondProjectId, label: "Shared label", parentFolder: null },
      ],
    ),
  ).toEqual([
    {
      faviconUrl: null,
      label: "Shared label",
      projectId: firstProjectId,
      projectPath: "/workspace/first",
      notes: [firstNote],
    },
    {
      faviconUrl: null,
      label: "Shared label",
      projectId: secondProjectId,
      projectPath: "/workspace/second",
      notes: [secondNote],
    },
  ])
})
