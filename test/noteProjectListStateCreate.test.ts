import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { noteProjectListStateCreate } = await import("../src/note/ui/noteProjectListStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const availableProject = {
  available: true,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb0",
  label: "Codeline",
  parentFolder: null,
}
const unavailableProject = {
  available: false,
  faviconUrl: null,
  id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb1",
  label: "Unavailable",
  parentFolder: null,
}

test("note project list state loads registered labels and availability for note groups and assignments", async () => {
  let calls = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: noteProjectListStateCreate({
      accountId: () => "user-1",
      fetcher: async (input) => {
        expect(String(input)).toBe("/api/project/registry")
        calls += 1
        return Response.json({ folders: [], projects: [availableProject, unavailableProject], truncated: false })
      },
    }),
  }))

  await tick()
  expect(root.state.projects()).toEqual([availableProject, unavailableProject])
  expect(root.state.availableProjects()).toEqual([availableProject])
  root.state.revalidate()
  expect(root.state.projects()).toEqual([availableProject, unavailableProject])
  await tick()
  expect(calls).toBe(2)
  root.dispose()
})
