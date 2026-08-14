import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { projectGitBranchDelete } from "../src/project/projectGitBranchDelete.js"
import { projectGitBranchListRead } from "../src/project/projectGitBranchListRead.js"
import { projectGitBranchRename } from "../src/project/projectGitBranchRename.js"
import { projectGitBranchSwitch } from "../src/project/projectGitBranchSwitch.js"
import type { ProjectGitCommand } from "../src/project/projectGitRepositoryResolve.js"

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

function resultErrorMessage(result: Awaited<ReturnType<typeof projectGitBranchSwitch>>): string {
  return result.success ? "" : result.errorMessage
}

describe("trusted project Git branch management", () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "project-git-test-")))
    await gitAssert(rootDir, ["init", "--initial-branch=main"])
    await gitAssert(rootDir, ["config", "user.email", "test@example.test"])
    await gitAssert(rootDir, ["config", "user.name", "Codeline Test"])
    await fs.writeFile(path.join(rootDir, "tracked.txt"), "initial\n", "utf8")
    await gitAssert(rootDir, ["add", "tracked.txt"])
    await gitAssert(rootDir, ["commit", "-m", "initial"])
    await gitAssert(rootDir, ["branch", "feature/one"])
    await gitAssert(rootDir, ["branch", "release/v1"])
  })

  afterEach(async () => {
    await fs.rm(rootDir, { force: true, recursive: true })
  })

  test("identifies the current branch and lists only other local branches", async () => {
    const result = await projectGitBranchListRead(rootDir)

    expect(result).toEqual({
      success: true,
      data: { currentBranch: "main", otherBranches: ["feature/one", "release/v1"] },
    })
    expect(JSON.stringify(result)).not.toContain(rootDir)
    expect(JSON.stringify(result)).not.toContain("refs/")
  })

  test("switches, renames, and deletes local branches", async () => {
    expect(await projectGitBranchSwitch(rootDir, "feature/one")).toEqual({ success: true, data: undefined })
    expect(await projectGitBranchRename(rootDir, "feature/one", "feature/two")).toEqual({
      success: true,
      data: undefined,
    })
    expect(await projectGitBranchDelete(rootDir, "main")).toEqual({ success: true, data: undefined })

    expect(await projectGitBranchListRead(rootDir)).toEqual({
      success: true,
      data: { currentBranch: "feature/two", otherBranches: ["release/v1"] },
    })
  })

  test("uses only fixed command forms with validated branch operands", async () => {
    const calls: string[][] = []
    const command: ProjectGitCommand = async (_root, args) => {
      calls.push([...args])
      if (args[0] === "rev-parse") {
        return {
          success: true,
          data: { exitCode: 0, stderr: "", stdout: `${rootDir}\n${rootDir}/.git\n${rootDir}/.git\ntrue\nmain\n` },
        }
      }
      if (args[0] === "for-each-ref") {
        return { success: true, data: { exitCode: 0, stderr: "", stdout: "feature/one\nmain\n" } }
      }
      return { success: true, data: { exitCode: 0, stderr: "", stdout: "" } }
    }

    await projectGitBranchListRead(rootDir, { command })
    await projectGitBranchSwitch(rootDir, "feature/one", { command })
    await projectGitBranchRename(rootDir, "main", "renamed", { command })
    await projectGitBranchDelete(rootDir, "feature/one", { command })

    expect(calls.filter((args) => args[0] !== "rev-parse")).toEqual([
      ["for-each-ref", "--sort=refname", "--format=%(refname:lstrip=2)", "refs/heads/"],
      ["switch", "--no-guess", "--", "feature/one"],
      ["branch", "-m", "--", "main", "renamed"],
      ["branch", "-D", "--", "feature/one"],
    ])
  })

  test("rejects unsafe names and option-like operands before mutation commands", async () => {
    const unsafeNames = ["-force", "refs/heads/main", "HEAD", "../escape", "bad..name", "bad@{name", "bad\nname"]
    let mutationCalls = 0
    const command: ProjectGitCommand = async () => {
      mutationCalls += 1
      return { success: true, data: { exitCode: 0, stderr: "", stdout: "" } }
    }

    for (const name of unsafeNames) {
      expect(resultErrorMessage(await projectGitBranchSwitch(rootDir, name, { command }))).toBe(
        "The Git branch name is invalid.",
      )
      expect(resultErrorMessage(await projectGitBranchRename(rootDir, "main", name, { command }))).toBe(
        "The Git branch name is invalid.",
      )
      expect(resultErrorMessage(await projectGitBranchDelete(rootDir, name, { command }))).toBe(
        "The Git branch name is invalid.",
      )
    }
    expect(mutationCalls).toBe(0)
  })

  test("rejects detached HEAD mutations and deleting the current branch", async () => {
    await gitAssert(rootDir, ["checkout", "--detach", "HEAD"])
    expect(await projectGitBranchListRead(rootDir)).toEqual({
      success: true,
      data: { currentBranch: null, otherBranches: ["feature/one", "main", "release/v1"] },
    })

    for (const result of [
      await projectGitBranchSwitch(rootDir, "feature/one"),
      await projectGitBranchRename(rootDir, "main", "renamed"),
      await projectGitBranchDelete(rootDir, "feature/one"),
    ]) {
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorMessage).toBe("Git branches cannot be changed from a detached HEAD.")
    }

    await gitAssert(rootDir, ["switch", "main"])
    const currentDelete = await projectGitBranchDelete(rootDir, "main")
    expect(currentDelete.success).toBe(false)
    if (!currentDelete.success) expect(currentDelete.errorMessage).toBe("The current Git branch cannot be deleted.")
  })

  test("rejects linked worktrees and repository subdirectories as trust roots", async () => {
    const worktreeParent = await fs.mkdtemp(path.join(os.tmpdir(), "project-git-worktree-test-"))
    const worktreeRoot = path.join(worktreeParent, "linked")
    const nestedRoot = path.join(rootDir, "nested")
    try {
      await gitAssert(rootDir, ["worktree", "add", "-b", "linked-test", worktreeRoot])
      await fs.mkdir(nestedRoot)

      for (const result of [await projectGitBranchListRead(worktreeRoot), await projectGitBranchListRead(nestedRoot)]) {
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.errorMessage).toContain("not trusted")
          expect(result.errorMessage).not.toContain(rootDir)
          expect(result.errorMessage).not.toContain(worktreeRoot)
        }
      }
    } finally {
      await gitAssert(rootDir, ["worktree", "remove", "--force", worktreeRoot])
      await fs.rm(worktreeParent, { force: true, recursive: true })
    }
  })

  test("sanitizes injected host paths and malformed branch output", async () => {
    const leakingProbe: ProjectGitCommand = async () => ({
      success: true,
      data: {
        exitCode: 0,
        stderr: `${rootDir}/private`,
        stdout: `/host/private/repository\n/host/private/repository/.git\n/host/private/repository/.git\ntrue\nmain\n`,
      },
    })
    const leaked = await projectGitBranchListRead(rootDir, { command: leakingProbe })
    expect(leaked.success).toBe(false)
    if (!leaked.success) {
      expect(leaked.errorMessage).toContain("not trusted")
      expect(leaked.errorMessage).not.toContain(rootDir)
      expect(leaked.errorMessage).not.toContain("/host/private")
    }

    const malformedList: ProjectGitCommand = async (_root, args) => {
      if (args[0] === "rev-parse") {
        return {
          success: true,
          data: { exitCode: 0, stderr: "", stdout: `${rootDir}\n${rootDir}/.git\n${rootDir}/.git\ntrue\nmain\n` },
        }
      }
      return {
        success: true,
        data: { exitCode: 0, stderr: `/host/private/${rootDir}`, stdout: "main\nrefs/heads/leak\n" },
      }
    }
    const malformed = await projectGitBranchListRead(rootDir, { command: malformedList })
    expect(malformed.success).toBe(false)
    if (!malformed.success) {
      expect(malformed.errorMessage).toBe("The Git branch list contains an invalid branch name.")
      expect(malformed.errorMessage).not.toContain(rootDir)
      expect(malformed.errorMessage).not.toContain("/host/private")
    }
  })
})
