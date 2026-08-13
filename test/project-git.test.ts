import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as v from "valibot"
import { projectGitDiffSummaryRead } from "../src/project/projectGitDiffSummaryRead.js"
import { projectGitDiffSummarySchema } from "../src/project/projectGitDiffSummarySchema.js"
import { projectGitStatusRead } from "../src/project/projectGitStatusRead.js"
import { projectGitStatusSchema } from "../src/project/projectGitStatusSchema.js"

type CommandOutput = { stdout: string; stderr: string; exitCode: number }

async function gitRun(rootDir: string, args: readonly string[]): Promise<CommandOutput> {
  const process = Bun.spawn(["git", "-C", rootDir, ...args], { stderr: "pipe", stdout: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  return { stdout, stderr, exitCode }
}

async function gitAssert(rootDir: string, args: readonly string[]): Promise<void> {
  const result = await gitRun(rootDir, args)
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout)
}

describe("project Git actions", () => {
  let rootDir: string

  beforeAll(async () => {
    rootDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "project-git-test-")))
    await gitAssert(rootDir, ["init", "--initial-branch=main"])
    await gitAssert(rootDir, ["config", "user.email", "test@example.test"])
    await gitAssert(rootDir, ["config", "user.name", "Codeline Test"])
    await fs.writeFile(path.join(rootDir, "tracked.txt"), "one\ntwo\n", "utf8")
    await gitAssert(rootDir, ["add", "tracked.txt"])
    await gitAssert(rootDir, ["commit", "-m", "initial"])
    await fs.writeFile(path.join(rootDir, "tracked.txt"), "one\ntwo\nthree\n", "utf8")
    await fs.writeFile(path.join(rootDir, "new.txt"), "new file\n", "utf8")
  })

  afterAll(async () => {
    await fs.rm(rootDir, { force: true, recursive: true })
  })

  test("reads only trusted-root relative status data", async () => {
    const result = await projectGitStatusRead(rootDir)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(v.safeParse(projectGitStatusSchema, result.data).success).toBe(true)
    expect(result.data).toMatchObject({
      branch: "main",
      isDirty: true,
      isGitRepository: true,
      files: [
        { path: "tracked.txt", status: "modified" },
        { path: "new.txt", status: "untracked" },
      ],
    })
    expect(JSON.stringify(result.data)).not.toContain(rootDir)
    for (const file of result.data.files) expect(path.isAbsolute(file.path)).toBe(false)
  })

  test("returns bounded tracked diff line summaries without patches or paths", async () => {
    const result = await projectGitDiffSummaryRead(rootDir)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(v.safeParse(projectGitDiffSummarySchema, result.data).success).toBe(true)
    expect(result.data).toEqual({
      additions: 1,
      binaryFiles: 0,
      deletions: 0,
      filesChanged: 1,
      isGitRepository: true,
    })
    expect(JSON.stringify(result.data)).not.toContain(rootDir)
  })

  test("accepts a linked worktree while keeping the worktree root trusted", async () => {
    const worktreeParent = await fs.mkdtemp(path.join(os.tmpdir(), "project-git-worktree-test-"))
    const worktreeRoot = path.join(worktreeParent, "linked")
    try {
      await gitAssert(rootDir, ["worktree", "add", "-b", "linked-test", worktreeRoot])
      const result = await projectGitStatusRead(worktreeRoot)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isGitRepository).toBe(true)
        expect(result.data.branch).toBe("linked-test")
        expect(JSON.stringify(result.data)).not.toContain(worktreeRoot)
      }
    } finally {
      await gitAssert(rootDir, ["worktree", "remove", "--force", worktreeRoot])
      await fs.rm(worktreeParent, { force: true, recursive: true })
    }
  })

  test("sanitizes command failures and rejects repository roots outside the trust boundary", async () => {
    const command = async (_root: string, args: readonly string[]) => {
      if (args[0] === "rev-parse") {
        return {
          success: true as const,
          data: {
            exitCode: 0,
            stderr: `/host/private/${rootDir}`,
            stdout: "/host/private/other\ntrue\nmain\n",
          },
        }
      }
      return {
        success: false as const,
        op: "testCommand",
        errorMessage: `/host/private/${rootDir}`,
      }
    }

    const result = await projectGitStatusRead(rootDir, { command })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errorMessage).toContain("trusted project root")
      expect(result.errorMessage).not.toContain(rootDir)
    }
  })

  test("returns an empty non-repository contract", async () => {
    const nonRepository = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "project-not-git-test-")))
    try {
      const status = await projectGitStatusRead(nonRepository)
      expect(status).toEqual({
        success: true,
        data: { branch: null, files: [], isDirty: false, isGitRepository: false },
      })
      const diff = await projectGitDiffSummaryRead(nonRepository)
      expect(diff).toEqual({
        success: true,
        data: { additions: 0, binaryFiles: 0, deletions: 0, filesChanged: 0, isGitRepository: false },
      })
    } finally {
      await fs.rm(nonRepository, { force: true, recursive: true })
    }
  })
})
