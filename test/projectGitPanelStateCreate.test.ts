import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { projectGitPanelStateCreate } from "../src/project/projectGitPanelStateCreate.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("project Git panel exposes status and blocks dirty branch switching", async () => {
  const calls: Array<{ body?: string; url: string }> = []
  const root = createRoot((dispose) => ({
    dispose,
    state: projectGitPanelStateCreate({
      confirmDelete: () => true,
      fetcher: async (input, init) => {
        const url = String(input)
        calls.push({ body: typeof init?.body === "string" ? init.body : undefined, url })
        if (url.endsWith("/git/status")) {
          return Response.json({
            branch: "main",
            files: [{ path: "src/index.ts", status: "modified" }],
            isDirty: true,
            isGitRepository: true,
          })
        }
        if (url.endsWith("/git/diff-summary")) {
          return Response.json({ additions: 3, binaryFiles: 0, deletions: 1, filesChanged: 1, isGitRepository: true })
        }
        if (url.endsWith("/git/branches")) {
          return Response.json({ currentBranch: "main", otherBranches: ["feature/one"] })
        }
        return Response.json({ success: true })
      },
    }),
  }))

  await tick()
  await tick()
  expect(root.state.status()?.files).toEqual([{ path: "src/index.ts", status: "modified" }])
  expect(root.state.diffSummary()?.additions).toBe(3)
  expect(root.state.localBranches()).toEqual([
    { isCurrent: true, name: "main" },
    { isCurrent: false, name: "feature/one" },
  ])

  root.state.branchSwitch("feature/one")
  expect(calls.some((call) => call.url.endsWith("/switch"))).toBe(false)
  root.state.branchDelete("feature/one")
  await tick()
  expect(calls.find((call) => call.url.endsWith("/delete"))?.body).toBe('{"branch":"feature/one"}')
  root.dispose()
})
