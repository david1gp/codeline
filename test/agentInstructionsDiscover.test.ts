import { afterEach, expect, test } from "bun:test"
import * as crypto from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { agentInstructionsDiscover } from "../src/instructions/actions/agentInstructionsDiscover.js"

const temporaryDirectories: string[] = []

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

function digest(content: string): string {
  return `sha256-${crypto.createHash("sha256").update(content, "utf8").digest("hex")}`
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory !== undefined) await fs.rm(directory, { force: true, recursive: true })
  }
})

test("discovers global, project, and nested AGENTS.md files in stable precedence order", async () => {
  const projectsRoot = await temporaryDirectory("codeline-instructions-projects-")
  const projectRoot = path.join(projectsRoot, "example")
  const globalRoot = await temporaryDirectory("codeline-instructions-global-")
  await fs.mkdir(path.join(projectRoot, "src", "deep"), { recursive: true })
  await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true })

  const files = [
    [path.join(globalRoot, "AGENTS.md"), "global instructions"],
    [path.join(projectRoot, "AGENTS.md"), "project instructions"],
    [path.join(projectRoot, "src", "AGENTS.md"), "src instructions"],
    [path.join(projectRoot, "src", "deep", "AGENTS.md"), "deep instructions"],
    [path.join(projectRoot, "docs", "AGENTS.md"), "docs instructions"],
    [path.join(projectRoot, "CLAUDE.md"), "must not be discovered"],
  ] as const
  for (const [filePath, content] of files) await fs.writeFile(filePath, content, "utf8")

  const discovered = await agentInstructionsDiscover({
    globalAgentsPath: path.join(globalRoot, "AGENTS.md"),
    projectRoot,
    workingDirectory: path.join(projectRoot, "src"),
  })

  expect(discovered.success).toBe(true)
  if (!discovered.success) return

  expect(discovered.data.diagnostics).toEqual([])
  expect(
    discovered.data.snapshots.map(({ source, scope, precedence, content }) => ({ content, precedence, scope, source })),
  ).toEqual([
    { content: "global instructions", precedence: 0, scope: "global", source: "global" },
    { content: "project instructions", precedence: 1, scope: ".", source: "project" },
    { content: "docs instructions", precedence: 2, scope: "docs", source: "project" },
    { content: "src instructions", precedence: 2, scope: "src", source: "project" },
    { content: "deep instructions", precedence: 3, scope: "src/deep", source: "project" },
  ])

  for (const entry of discovered.data.snapshots) {
    expect(entry.canonicalPath).toBe(path.resolve(entry.canonicalPath))
    expect(entry.digest).toBe(digest(entry.content))
    expect(entry.size).toBe(Buffer.byteLength(entry.content, "utf8"))
  }
  expect(discovered.data.snapshots.some(({ canonicalPath }) => canonicalPath.endsWith("CLAUDE.md"))).toBe(false)
})

test("reports bounded validation diagnostics and rejects an outside working directory", async () => {
  const projectsRoot = await temporaryDirectory("codeline-instructions-validation-")
  const projectRoot = path.join(projectsRoot, "example")
  const globalRoot = await temporaryDirectory("codeline-instructions-validation-global-")
  const outsideRoot = await temporaryDirectory("codeline-instructions-outside-")
  await fs.mkdir(path.join(projectRoot, "linked", "nested"), { recursive: true })
  await fs.writeFile(path.join(globalRoot, "AGENTS.md"), "global", "utf8")
  await fs.writeFile(path.join(projectRoot, "AGENTS.md"), Buffer.from([0, 1, 2]))
  await fs.writeFile(path.join(projectRoot, "linked", "nested", "AGENTS.md"), Buffer.from([0xc3, 0x28]))
  await fs.symlink(path.join(globalRoot, "AGENTS.md"), path.join(projectRoot, "linked", "AGENTS.md"))

  const outsideWorkingDirectory = await agentInstructionsDiscover({
    globalAgentsPath: path.join(globalRoot, "AGENTS.md"),
    projectRoot,
    workingDirectory: outsideRoot,
  })
  expect(outsideWorkingDirectory).toMatchObject({
    success: false,
    errorMessage: "The instruction working directory is invalid.",
  })

  const discovered = await agentInstructionsDiscover({
    globalAgentsPath: path.join(globalRoot, "AGENTS.md"),
    maxFileBytes: 2,
    projectRoot,
  })
  expect(discovered.success).toBe(true)
  if (!discovered.success) return

  expect(discovered.data.snapshots).toEqual([])
  expect(discovered.data.diagnostics.map(({ code }) => code)).toEqual([
    "file-too-large",
    "file-too-large",
    "symbolic-link",
    "invalid-utf8",
  ])
})

test("enforces snapshot and total-byte budgets without changing discovery output shape", async () => {
  const projectsRoot = await temporaryDirectory("codeline-instructions-budgets-")
  const projectRoot = path.join(projectsRoot, "example")
  const globalRoot = await temporaryDirectory("codeline-instructions-budgets-global-")
  await fs.mkdir(projectRoot)
  await fs.writeFile(path.join(globalRoot, "AGENTS.md"), "g", "utf8")
  await fs.writeFile(path.join(projectRoot, "AGENTS.md"), "r", "utf8")

  const snapshotLimited = await agentInstructionsDiscover({
    globalAgentsPath: path.join(globalRoot, "AGENTS.md"),
    maxSnapshots: 1,
    projectRoot,
  })
  expect(snapshotLimited.success).toBe(true)
  if (!snapshotLimited.success) return
  expect(snapshotLimited.data.snapshots).toHaveLength(1)
  expect(snapshotLimited.data.diagnostics.map(({ code }) => code)).toEqual(["snapshot-limit-exceeded"])

  const byteLimited = await agentInstructionsDiscover({
    globalAgentsPath: path.join(globalRoot, "AGENTS.md"),
    maxTotalBytes: 1,
    projectRoot,
  })
  expect(byteLimited.success).toBe(true)
  if (!byteLimited.success) return
  expect(byteLimited.data.snapshots).toHaveLength(1)
  expect(byteLimited.data.diagnostics.map(({ code }) => code)).toEqual(["total-byte-budget-exceeded"])
})

test("skips dependency, VCS, and build directories so third-party AGENTS.md never becomes project instruction", async () => {
  const projectsRoot = await temporaryDirectory("codeline-instructions-excluded-")
  const projectRoot = path.join(projectsRoot, "example")
  const globalRoot = await temporaryDirectory("codeline-instructions-excluded-global-")
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true })
  await fs.mkdir(path.join(projectRoot, "node_modules", "fastify"), { recursive: true })
  await fs.mkdir(path.join(projectRoot, "dist", "server"), { recursive: true })
  await fs.mkdir(path.join(projectRoot, ".git", "hooks"), { recursive: true })
  await fs.writeFile(path.join(globalRoot, "AGENTS.md"), "global", "utf8")
  await fs.writeFile(path.join(projectRoot, "AGENTS.md"), "root", "utf8")
  await fs.writeFile(path.join(projectRoot, "src", "AGENTS.md"), "src", "utf8")
  await fs.writeFile(path.join(projectRoot, "node_modules", "fastify", "AGENTS.md"), "dependency", "utf8")
  await fs.writeFile(path.join(projectRoot, "dist", "server", "AGENTS.md"), "build output", "utf8")
  await fs.writeFile(path.join(projectRoot, ".git", "hooks", "AGENTS.md"), "vcs", "utf8")

  const discovered = await agentInstructionsDiscover({
    globalAgentsPath: path.join(globalRoot, "AGENTS.md"),
    projectRoot,
  })

  expect(discovered.success).toBe(true)
  if (!discovered.success) return
  expect(discovered.data.snapshots.map(({ scope, source }) => `${source}:${scope}`)).toEqual([
    "global:global",
    "project:.",
    "project:src",
  ])
  expect(discovered.data.snapshots.map(({ content }) => content)).not.toContain("dependency")
  expect(discovered.data.diagnostics).toEqual([])
})
