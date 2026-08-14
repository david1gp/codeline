import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"

async function gitRun(rootDir: string, args: readonly string[]): Promise<void> {
  const process = Bun.spawn(["git", "-C", rootDir, ...args], { stderr: "pipe", stdout: "ignore" })
  const [stderr, exitCode] = await Promise.all([new Response(process.stderr).text(), process.exited])
  if (exitCode !== 0) throw new Error(stderr)
}

describe("project Git HTTP routes", () => {
  let app: Hono<AppEnvironment>
  let rootDir: string

  beforeAll(async () => {
    rootDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "project-git-api-test-")))
    await gitRun(rootDir, ["init", "--initial-branch=main"])
    await gitRun(rootDir, ["config", "user.email", "test@example.test"])
    await gitRun(rootDir, ["config", "user.name", "Codeline Test"])
    await fs.writeFile(path.join(rootDir, "tracked.txt"), "initial\n")
    await gitRun(rootDir, ["add", "tracked.txt"])
    await gitRun(rootDir, ["commit", "-m", "initial"])
    await gitRun(rootDir, ["branch", "feature/one"])
    app = new Hono<AppEnvironment>()
    apiProjectRoutesAdd(app, { rootDir })
  })

  afterAll(async () => fs.rm(rootDir, { force: true, recursive: true }))

  test("returns project status, summary, and local branches without host paths", async () => {
    await fs.writeFile(path.join(rootDir, "tracked.txt"), "changed\n")
    const responses = await Promise.all([
      app.request("http://codeline.test/project/git/status"),
      app.request("http://codeline.test/project/git/diff-summary"),
      app.request("http://codeline.test/project/git/branches"),
    ])
    const bodies = await Promise.all(responses.map((response) => response.json()))

    expect(responses.every((response) => response.status === 200)).toBe(true)
    expect(bodies[0]).toMatchObject({ branch: "main", isDirty: true, files: [{ path: "tracked.txt" }] })
    expect(bodies[1]).toMatchObject({ additions: 1, deletions: 1, filesChanged: 1 })
    expect(bodies[2]).toEqual({ currentBranch: "main", otherBranches: ["feature/one"] })
    expect(JSON.stringify(bodies)).not.toContain(rootDir)
  })

  test("rejects dirty switching and permits validated rename and delete operations", async () => {
    const dirtySwitch = await app.request("http://codeline.test/project/git/branches/switch", {
      body: JSON.stringify({ branch: "feature/one" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(dirtySwitch.status).toBe(409)
    expect(await dirtySwitch.json()).toEqual({
      error: { code: "conflict", message: "Switching branches requires a clean working tree." },
    })

    const rename = await app.request("http://codeline.test/project/git/branches/rename", {
      body: JSON.stringify({ branch: "feature/one", newBranch: "feature/two" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(rename.status).toBe(200)
    const remove = await app.request("http://codeline.test/project/git/branches/delete", {
      body: JSON.stringify({ branch: "feature/two" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(remove.status).toBe(200)
  })
})
