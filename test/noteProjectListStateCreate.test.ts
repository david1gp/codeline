import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { noteProjectListStateCreate } from "../src/note/ui/noteProjectListStateCreate.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("note project list state loads labels used by note groups and assignments", async () => {
  let calls = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: noteProjectListStateCreate({
      fetcher: async (input) => {
        expect(String(input)).toBe("/api/project/list")
        calls += 1
        return Response.json({ projects: [{ id: "opaque-project-id", label: "Codeline" }], truncated: false })
      },
    }),
  }))

  await tick()
  expect(root.state.projects()).toEqual([{ id: "opaque-project-id", label: "Codeline" }])
  root.state.revalidate()
  expect(root.state.projects()).toEqual([{ id: "opaque-project-id", label: "Codeline" }])
  await tick()
  expect(calls).toBe(2)
  root.dispose()
})
