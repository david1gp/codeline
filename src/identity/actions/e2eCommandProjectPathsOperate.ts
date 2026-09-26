import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"

type Stored = { path: string; createdAt: Date; manifest: Record<string, string> }
type Operation = "issue" | "status" | "purge-status" | "remove" | "rollback"
type PathResult = { path: string; manifest: Record<string, string> }

const files = [
  ".agents/commands/delegate-review.md",
  ".agents/commands/git/status.md",
  ".agents/commands/marker.txt",
  ".agents/commands/notes.md",
  ".agents/commands/review.md",
  ".agents/commands/simulate.md",
  ".agents/commands/subtask.md",
  ".agents/commands/summarize.md",
] as const
const readme = "# E2E command fixture\n\nRun-owned project for the chat command expansion workflow.\n"
const digest = (content: Buffer) => createHash("sha256").update(content).digest("hex")
const absent = async (target: string) =>
  fs.lstat(target).then(
    () => false,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return true
      throw error
    },
  )

/** Only creates and removes a single, exclusively allocated directory beneath a configured canonical root. */
export async function e2eCommandProjectPathsOperate(
  runId: string,
  roots: readonly string[],
  operation: Operation,
  stored?: Stored,
  createdPaths: string[] = [],
): Promise<Result<PathResult>> {
  const op = "e2eCommandProjectPathsOperate"
  if (!/^[0-9a-z]{6,40}$/.test(runId)) return createResultError(op, "The fixture run identifier is invalid.")
  try {
    const validRoots: string[] = []
    for (const root of roots) {
      if (!path.isAbsolute(root) || root !== path.normalize(root)) continue
      if (await absent(root)) continue
      if ((await fs.lstat(root)).isDirectory() && (await fs.realpath(root)) === root) validRoots.push(root)
    }
    const root = operation === "issue" ? validRoots[0] : stored === undefined ? undefined : path.dirname(stored.path)
    const target = root === undefined ? undefined : path.join(root, `.e2e-command-${runId}`)
    if (
      target === undefined ||
      (operation !== "issue" &&
        (stored === undefined ||
          !validRoots.includes(root!) ||
          stored.path !== target ||
          !Number.isFinite(stored.createdAt.getTime())))
    )
      return createResultError(op, "The command project path is outside configured roots or has changed.")

    if (operation === "issue") {
      const contents: Record<string, Buffer> = {
        "README.md": Buffer.from(readme),
        ".e2e-owner": Buffer.from(JSON.stringify({ runId, path: target, createdAt: stored!.createdAt.toISOString() })),
      }
      for (const file of files) {
        const source = path.join(process.cwd(), file)
        if (!(await fs.lstat(source)).isFile())
          return createResultError(op, "A checked-in command fixture is unavailable.")
        contents[file] = await fs.readFile(source)
      }
      const manifest = Object.fromEntries(Object.entries(contents).map(([name, content]) => [name, digest(content)]))
      // No adoption of an existing path, even if it has an E2E-looking name or marker.
      await fs.mkdir(target)
      createdPaths.push(target)
      try {
        await fs.mkdir(path.join(target, ".agents"))
        await fs.mkdir(path.join(target, ".agents/commands"))
        await fs.mkdir(path.join(target, ".agents/commands/git"))
        for (const [name, content] of Object.entries(contents))
          await fs.writeFile(path.join(target, name), content, { flag: "wx" })
      } catch (_error) {
        const rolledBack = await e2eCommandProjectPathsOperate(runId, roots, "rollback", {
          path: target,
          createdAt: stored!.createdAt,
          manifest,
        })
        if (!rolledBack.success) return rolledBack
        return createResultError(op, "The command project could not be written.")
      }
      return createResult({ path: target, manifest })
    }

    const manifest = stored!.manifest
    const expected = ["README.md", ".e2e-owner", ...files]
    if (
      Object.keys(manifest).length !== expected.length ||
      expected.some((name) => typeof manifest[name] !== "string" || !/^[a-f0-9]{64}$/.test(manifest[name]!)) ||
      manifest[".e2e-owner"] !==
        digest(Buffer.from(JSON.stringify({ runId, path: target, createdAt: stored!.createdAt.toISOString() }))) ||
      manifest["README.md"] !== digest(Buffer.from(readme))
    )
      return createResultError(op, "The command project manifest is invalid.")
    if (await absent(target)) {
      if (operation === "purge-status" || operation === "remove" || operation === "rollback")
        return createResult({ path: target, manifest })
      return createResultError(op, "The command project directory is missing.")
    }
    if (!(await fs.lstat(target)).isDirectory() || (await fs.realpath(target)) !== target)
      return createResultError(op, "The command project directory changed.")
    const entries = (await fs.readdir(target)).sort()
    if (
      operation === "rollback"
        ? entries.some((name) => ![".agents", ".e2e-owner", "README.md"].includes(name))
        : entries.join("\0") !== [".agents", ".e2e-owner", "README.md"].sort().join("\0")
    )
      return createResultError(op, "The command project contains unknown entries.")
    for (const directory of [".agents", ".agents/commands", ".agents/commands/git"]) {
      const full = path.join(target, directory)
      if (operation === "rollback" && (await absent(full))) continue
      if (!(await fs.lstat(full)).isDirectory() || (await fs.realpath(full)) !== full)
        return createResultError(op, "The command project contains an unknown directory.")
    }
    if (
      operation !== "rollback" &&
      ((await fs.readdir(path.join(target, ".agents"))).join("\0") !== "commands" ||
        (await fs.readdir(path.join(target, ".agents/commands"))).sort().join("\0") !==
          [...files.map((file) => path.basename(file)).filter((name) => name !== "status.md"), "git"]
            .sort()
            .join("\0") ||
        (await fs.readdir(path.join(target, ".agents/commands/git"))).join("\0") !== "status.md")
    )
      return createResultError(op, "The command project contains unknown entries.")
    if (operation === "rollback") {
      for (const directory of [".agents", ".agents/commands", ".agents/commands/git"]) {
        const full = path.join(target, directory)
        if (await absent(full)) continue
        const allowed =
          directory === ".agents"
            ? ["commands"]
            : directory.endsWith("/git")
              ? ["status.md"]
              : ["git", ...files.map((file) => path.basename(file)).filter((name) => name !== "status.md")]
        if ((await fs.readdir(full)).some((name) => !allowed.includes(name)))
          return createResultError(op, "The command project contains unknown entries.")
      }
    }
    for (const name of expected) {
      const full = path.join(target, name)
      if (operation === "rollback" && (await absent(full))) continue
      if (!(await fs.lstat(full)).isFile() || digest(await fs.readFile(full)) !== manifest[name])
        return createResultError(op, "The command project content or ownership marker changed.")
    }
    if (operation === "remove" || operation === "rollback") {
      for (const name of expected)
        if (operation === "remove" || !(await absent(path.join(target, name)))) await fs.unlink(path.join(target, name))
      for (const directory of [".agents/commands/git", ".agents/commands", ".agents", ""])
        if (operation === "remove" || !(await absent(path.join(target, directory))))
          await fs.rmdir(path.join(target, directory))
      if (!(await absent(target))) return createResultError(op, "The command project was not removed.")
    }
    return createResult({ path: target, manifest })
  } catch (_error) {
    // Never recursively delete an unexpected or substituted directory.
    return createResultError(op, "The command project filesystem operation failed.")
  }
}
