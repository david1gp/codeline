import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { activeProjectStateCreate } = await import("../src/ui/activeProjectStateCreate.js")
const { newProjectDialogStateCreate } = await import("../src/ui/newProjectDialogStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function deferredCreate<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

test("dialog loads clickable suggestions and activates only the server-confirmed project", async () => {
  const requests: Array<{ body?: string; url: string }> = []
  let confirmedProjectPath: string | undefined
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    return {
      activeProject,
      dispose,
      state: newProjectDialogStateCreate({
        activeProject,
        debounceMs: 0,
        fetch: async (input, init) => {
          requests.push({ body: init?.body === undefined ? undefined : String(init.body), url: String(input) })
          if (String(input).startsWith("/api/project/suggestions")) {
            return Response.json({ suggestions: [{ label: "Codeline", path: "/workspace/codeline" }] })
          }
          return Response.json({
            project: {
              available: true,
              id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f60",
              label: "Canonical Codeline",
            },
          })
        },
        onProjectConfirmed: (projectPath) => {
          confirmedProjectPath = projectPath
        },
      }),
    }
  })

  root.state.openChange(true)
  await tick()
  expect(root.state.suggestions()).toEqual([{ label: "Codeline", path: "/workspace/codeline" }])
  root.state.suggestionSelect("/workspace/codeline")
  expect(root.activeProject.project()).toEqual({ id: null, label: "Home", path: "~" })

  await root.state.projectConfirm()
  expect(requests.at(-1)).toEqual({
    body: JSON.stringify({ path: "/workspace/codeline" }),
    url: "/api/project/registry",
  })
  expect(root.activeProject.project()).toEqual({
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f60",
    label: "Canonical Codeline",
    path: "/workspace/codeline",
  })
  expect(confirmedProjectPath).toBe("/workspace/codeline")
  expect(root.state.open()).toBe(false)
  root.dispose()
})

test("dialog rejects failed confirmation without changing the active project", async () => {
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    return {
      activeProject,
      dispose,
      state: newProjectDialogStateCreate({
        activeProject,
        debounceMs: 0,
        fetch: async (input) =>
          String(input).startsWith("/api/project/suggestions")
            ? Response.json({ suggestions: [] })
            : Response.json(
                { error: { code: "bad_request", message: "The project directory is invalid." } },
                { status: 400 },
              ),
      }),
    }
  })

  root.state.pathChange("/outside")
  await root.state.projectConfirm()
  expect(root.activeProject.project()).toEqual({ id: null, label: "Home", path: "~" })
  expect(root.state.errorMessage()).toBe("The project directory is invalid.")
  expect(root.state.confirmStatus()).toBe("error")
  root.dispose()
})

test("a stale suggestion response cannot replace newer results", async () => {
  const responses = [deferredCreate<Response>(), deferredCreate<Response>()]
  let requestIndex = 0
  const root = createRoot((dispose) => {
    const activeProject = activeProjectStateCreate()
    return {
      dispose,
      state: newProjectDialogStateCreate({
        activeProject,
        debounceMs: 0,
        fetch: async () => responses[requestIndex++]?.promise ?? Response.json({ suggestions: [] }),
      }),
    }
  })

  root.state.pathChange("old")
  root.state.pathChange("new")
  responses[1]?.resolve(Response.json({ suggestions: [{ label: "New", path: "/workspace/new" }] }))
  await tick()
  responses[0]?.resolve(Response.json({ suggestions: [{ label: "Old", path: "/workspace/old" }] }))
  await tick()

  expect(root.state.suggestions()).toEqual([{ label: "New", path: "/workspace/new" }])
  root.dispose()
})
