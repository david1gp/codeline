import { expect, test } from "bun:test"
import { sessionProjectSelectorOptionsDerive } from "../src/ui/sessionProjectSelectorOptionsDerive.js"

test("groups projects by parentFolder alphabetically and sorts projects within groups", () => {
  const options = sessionProjectSelectorOptionsDerive([
    {
      id: "project-zeta",
      label: "Zeta App",
      parentFolder: { id: "folder-tools", label: "Tools" },
    },
    {
      id: "project-alpha",
      label: "Alpha Service",
      parentFolder: { id: "folder-core", label: "Core Services" },
    },
    {
      id: "project-beta",
      label: "Beta Service",
      parentFolder: { id: "folder-core", label: "Core Services" },
    },
    {
      id: "project-standalone",
      label: "Solo Project",
      parentFolder: null,
    },
  ])

  expect(options).toEqual([
    { label: "Core Services", type: "group" },
    { type: "item", value: "project-alpha" },
    { type: "item", value: "project-beta" },
    { label: "Tools", type: "group" },
    { type: "item", value: "project-zeta" },
    { label: "Uncategorized", type: "group" },
    { type: "item", value: "project-standalone" },
  ])
})

test("falls back to Uncategorized for projects with undefined parentFolder or blank label", () => {
  const options = sessionProjectSelectorOptionsDerive([
    { id: "project-1", label: "Project One" },
    { id: "project-2", label: "Project Two", parentFolder: { id: "f-empty", label: "   " } },
  ])

  expect(options).toEqual([
    { label: "Uncategorized", type: "group" },
    { type: "item", value: "project-1" },
    { type: "item", value: "project-2" },
  ])
})

test("preserves every project even with identical labels", () => {
  const options = sessionProjectSelectorOptionsDerive([
    { id: "proj-b", label: "Same Name", parentFolder: null },
    { id: "proj-a", label: "Same Name", parentFolder: null },
  ])

  expect(options).toEqual([
    { label: "Uncategorized", type: "group" },
    { type: "item", value: "proj-a" },
    { type: "item", value: "proj-b" },
  ])
})

test("returns an empty array when no projects are given", () => {
  expect(sessionProjectSelectorOptionsDerive([])).toEqual([])
})

test("filters case-insensitively by visible project and parent-folder details", () => {
  expect(
    sessionProjectSelectorOptionsDerive(
      [
        { id: "project-api", label: "API Service", parentFolder: { id: "folder-core", label: "Core" } },
        { id: "project-web", label: "Web App", parentFolder: { id: "folder-core", label: "Core" } },
        { id: "project-tools", label: "Release Tools", parentFolder: { id: "folder-tools", label: "Tooling" } },
      ],
      "TOOL",
    ),
  ).toEqual([
    { label: "Tooling", type: "group" },
    { type: "item", value: "project-tools" },
  ])

  expect(
    sessionProjectSelectorOptionsDerive(
      [{ id: "project-api", label: "API Service", parentFolder: { id: "folder-core", label: "Core" } }],
      "service",
    ),
  ).toEqual([
    { label: "Core", type: "group" },
    { type: "item", value: "project-api" },
  ])
})

test("keeps unavailable projects out and leaves the project list empty for a non-match", () => {
  const projects = [
    { available: true, id: "project-api", label: "API Service", parentFolder: null },
    { available: false, id: "project-missing", label: "API Missing", parentFolder: null },
  ]

  expect(sessionProjectSelectorOptionsDerive(projects, "api")).toEqual([
    { label: "Uncategorized", type: "group" },
    { type: "item", value: "project-api" },
  ])
  expect(sessionProjectSelectorOptionsDerive(projects, "unknown")).toEqual([])
})
