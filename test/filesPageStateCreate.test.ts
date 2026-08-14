import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { filesPageStateCreate } from "../src/ui/filesPageStateCreate.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const firstProject = { id: "a".repeat(64), label: "alpha" }
const secondProject = { id: "b".repeat(64), label: "beta" }

test("Files page loads discovered projects and accepts only a discovered selection", async () => {
  const calls: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({
      fetcher: async (input) => {
        calls.push(String(input))
        return Response.json({ projects: [firstProject, secondProject], truncated: false })
      },
    }),
  }))

  await tick()
  expect(calls).toEqual(["/api/project/list"])
  expect(root.state.status()).toBe("ready")
  expect(root.state.selectedProject()).toEqual(firstProject)

  root.state.projectSelect({ currentTarget: { value: secondProject.id } } as Event & {
    currentTarget: HTMLSelectElement
  })
  expect(root.state.selectedProject()).toEqual(secondProject)
  root.state.projectSelect({ currentTarget: { value: "unlisted" } } as Event & {
    currentTarget: HTMLSelectElement
  })
  expect(root.state.selectedProject()).toEqual(secondProject)
  root.dispose()
})

test("Files page exposes empty, error, and retry states", async () => {
  let attempts = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({
      fetcher: async () => {
        attempts += 1
        if (attempts === 1) return new Response(null, { status: 500 })
        return Response.json({ projects: [], truncated: false })
      },
    }),
  }))

  await tick()
  expect(root.state.status()).toBe("error")
  expect(root.state.selectedProject()).toBeNull()
  root.state.retry()
  await tick()
  expect(root.state.status()).toBe("ready")
  expect(root.state.projects()).toEqual([])
  expect(root.state.selectedProject()).toBeNull()
  root.dispose()
})

test("Files page restores the legacy single-root browser mode", async () => {
  const root = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({
      fetcher: async () =>
        new Response(JSON.stringify({ projects: [], truncated: false }), {
          headers: { "Content-Type": "application/json", "X-Codeline-Project-Mode": "legacy-single-root" },
        }),
    }),
  }))

  await tick()
  expect(root.state.legacySingleRoot()).toBe(true)
  expect(root.state.status()).toBe("ready")
  root.dispose()
})

test("Files page exposes the sanitized discovery truncation signal", async () => {
  const root = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({
      fetcher: async () => Response.json({ projects: [], truncated: true }),
    }),
  }))

  await tick()
  expect(root.state.status()).toBe("ready")
  expect(root.state.truncated()).toBe(true)
  root.dispose()
})

test("Files page ignores an older project-list response after a retry", async () => {
  const pending: Array<(response: Response) => void> = []
  const root = createRoot((dispose) => ({
    dispose,
    state: filesPageStateCreate({
      fetcher: async () => new Promise<Response>((resolve) => pending.push(resolve)),
    }),
  }))

  root.state.retry()
  expect(pending).toHaveLength(2)
  pending[1]?.(Response.json({ projects: [secondProject], truncated: false }))
  await tick()
  pending[0]?.(Response.json({ projects: [firstProject], truncated: false }))
  await tick()

  expect(root.state.projects()).toEqual([secondProject])
  expect(root.state.selectedProject()).toEqual(secondProject)
  root.dispose()
})
