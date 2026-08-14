import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { projectGitPanelStateCreate } from "../src/project/projectGitPanelStateCreate.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const projectId = "a".repeat(64)

test("project Git panel exposes status and blocks dirty branch switching", async () => {
  const calls: Array<{ body?: string; url: string }> = []
  const root = createRoot((dispose) => ({
    dispose,
    state: projectGitPanelStateCreate({
      confirmDelete: () => true,
      projectId,
      fetcher: async (input, init) => {
        const url = String(input)
        calls.push({ body: typeof init?.body === "string" ? init.body : undefined, url })
        const pathname = new URL(url, "https://codeline.test").pathname
        if (pathname.endsWith("/git/status")) {
          return Response.json({
            branch: "main",
            files: [{ path: "src/index.ts", status: "modified" }],
            isDirty: true,
            isGitRepository: true,
          })
        }
        if (pathname.endsWith("/git/diff-summary")) {
          return Response.json({ additions: 3, binaryFiles: 0, deletions: 1, filesChanged: 1, isGitRepository: true })
        }
        if (pathname.endsWith("/git/branches")) {
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
  expect(
    calls
      .slice(0, 3)
      .every((call) => new URL(call.url, "https://codeline.test").searchParams.get("project") === projectId),
  ).toBe(true)

  root.state.branchSwitch("feature/one")
  expect(calls.some((call) => new URL(call.url, "https://codeline.test").pathname.endsWith("/switch"))).toBe(false)
  root.state.branchDelete("feature/one")
  await tick()
  const deleteCall = calls.find((call) => new URL(call.url, "https://codeline.test").pathname.endsWith("/delete"))
  expect(deleteCall?.body).toBe('{"branch":"feature/one"}')
  expect(new URL(deleteCall!.url, "https://codeline.test").searchParams.get("project")).toBe(projectId)
  root.dispose()
})
