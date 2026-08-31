import { expect, test } from "bun:test"
import { sessionProjectSelectorGroupsDerive } from "../src/ui/sessionProjectSelectorGroupsDerive.js"

test("builds ordered folder groups containing the matching project rendering metadata", () => {
  const projects = [
    { faviconUrl: "https://example.test/b.svg", id: "b", label: "Beta" },
    { faviconUrl: null, id: "a", label: "Alpha" },
    { faviconUrl: null, id: "filtered", label: "Filtered" },
  ]

  expect(
    sessionProjectSelectorGroupsDerive(
      [
        { label: "Core", type: "group" },
        { type: "item", value: "a" },
        { label: "Tools", type: "group" },
        { type: "item", value: "b" },
      ],
      projects,
    ),
  ).toEqual([
    { label: "Core", projects: [projects[1]!] },
    { label: "Tools", projects: [projects[0]!] },
  ])
})
