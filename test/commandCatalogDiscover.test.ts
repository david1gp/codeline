import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { commandCatalogDiscover } from "../src/commands/actions/commandCatalogDiscover.js"

let rootDirectory: string
let globalCommandsPath: string
let projectRoot: string
let projectCommandsPath: string

async function writeCommand(
  commandsRoot: string,
  relativePath: string,
  frontmatter: readonly string[],
  body: string,
): Promise<void> {
  const filePath = path.join(commandsRoot, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, ["---", ...frontmatter, "---", body].join("\n"), "utf8")
}

beforeAll(async () => {
  rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-command-discovery-"))
  globalCommandsPath = path.join(rootDirectory, "global", "commands")
  projectRoot = path.join(rootDirectory, "project")
  projectCommandsPath = path.join(projectRoot, ".agents", "commands")
  await fs.mkdir(projectCommandsPath, { recursive: true })

  await writeCommand(globalCommandsPath, "shared.md", ["description: Global shared"], "Global shared template.")
  await writeCommand(globalCommandsPath, "only-global.md", ["description: Only global"], "Global only template.")
  await writeCommand(globalCommandsPath, "git/commit.md", ["description: Global commit"], "Commit $ARGUMENTS")

  await writeCommand(projectCommandsPath, "shared.md", ["description: Project shared"], "Project shared template.")
  await writeCommand(
    projectCommandsPath,
    "review.md",
    ["description: Review a change", "agent: reviewer", "model: cliproxyapi/opus", "subtask: true"],
    "Review $1 and $2.",
  )
  await writeCommand(projectCommandsPath, "deep/nested/thing.md", ["description: Nested"], "Nested template.")

  // Invalid entries produce diagnostics instead of commands.
  await fs.writeFile(path.join(projectCommandsPath, "no-frontmatter.md"), "Just a body.", "utf8")
  await fs.writeFile(
    path.join(projectCommandsPath, "broken-frontmatter.md"),
    ["---", "description: [unclosed", "---", "body"].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(projectCommandsPath, "unknown-key.md"),
    ["---", "description: Fine", "unexpected: true", "---", "body"].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(projectCommandsPath, "empty-template.md"),
    ["---", "description: Empty", "---", "   "].join("\n"),
    "utf8",
  )
  await fs.writeFile(path.join(projectCommandsPath, "Invalid Name.md"), ["---", "---", "body"].join("\n"), "utf8")
  await fs.writeFile(path.join(projectCommandsPath, "binary.md"), Buffer.from([0x2d, 0x00, 0x2d]))
  await fs.writeFile(path.join(projectCommandsPath, "notes.txt"), "ignored", "utf8")
})

afterAll(async () => {
  await fs.rm(rootDirectory, { force: true, recursive: true })
})

test("discovers recursive project and global commands with stable names, ordering, and a stable digest", async () => {
  const first = await commandCatalogDiscover({ globalCommandsPath, projectRoot })
  const second = await commandCatalogDiscover({ globalCommandsPath, projectRoot })

  expect(first.success).toBe(true)
  expect(second.success).toBe(true)
  if (!first.success || !second.success) return

  expect(first.data.digest).toMatch(/^sha256-[a-f0-9]{64}$/)
  expect(first.data.digest).toBe(second.data.digest)
  expect(first.data.version).toBe(1)
  expect(first.data.commands.map(({ name }) => name)).toEqual([
    "deep/nested/thing",
    "git/commit",
    "only-global",
    "review",
    "shared",
  ])
  expect(first.data.roots).toEqual([
    { canonicalPath: globalCommandsPath, precedence: 0, source: "global" },
    { canonicalPath: projectCommandsPath, precedence: 1, source: "project" },
  ])
})

test("parses frontmatter description, agent, model, and subtask into the snapshot", async () => {
  const catalog = await commandCatalogDiscover({ globalCommandsPath, projectRoot })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return

  const review = catalog.data.commands.find(({ name }) => name === "review")
  expect(review).toMatchObject({
    agent: "reviewer",
    body: "Review $1 and $2.",
    description: "Review a change",
    model: "cliproxyapi/opus",
    precedence: 1,
    relativePath: "review.md",
    source: "project",
    subtask: true,
  })
  expect(review?.canonicalPath).toBe(path.join(projectCommandsPath, "review.md"))
  expect(review?.digest).toMatch(/^sha256-[a-f0-9]{64}$/)
  expect(review?.templateDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
  expect(review?.digest).not.toBe(review?.templateDigest)

  const nested = catalog.data.commands.find(({ name }) => name === "deep/nested/thing")
  expect(nested?.relativePath).toBe("deep/nested/thing.md")
  expect(nested?.description).toBe("Nested")
  expect(nested?.agent).toBeUndefined()
  expect(nested?.model).toBeUndefined()
  expect(nested?.subtask).toBeUndefined()
})

test("project commands take precedence over global commands and the collision stays visible", async () => {
  const catalog = await commandCatalogDiscover({ globalCommandsPath, projectRoot })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return

  const shared = catalog.data.commands.find(({ name }) => name === "shared")
  expect(shared).toMatchObject({ body: "Project shared template.", precedence: 1, source: "project" })

  expect(catalog.data.collisions.map(({ name }) => name)).toEqual(["shared"])
  const collision = catalog.data.collisions[0]
  expect(collision?.winner).toMatchObject({ precedence: 1, source: "project" })
  expect(collision?.candidates.map(({ source }) => source)).toEqual(["project", "global"])
  expect(collision?.candidates.map(({ templateDigest }) => templateDigest)).toHaveLength(2)
  expect(new Set(collision?.candidates.map(({ digest }) => digest)).size).toBe(2)
})

test("invalid command files produce ordered diagnostics and are excluded from the catalog", async () => {
  const catalog = await commandCatalogDiscover({ globalCommandsPath, projectRoot })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return

  const byRelativePath = new Map(catalog.data.diagnostics.map((diagnostic) => [diagnostic.relativePath, diagnostic]))
  expect(byRelativePath.get("no-frontmatter.md")?.code).toBe("frontmatter-missing")
  expect(byRelativePath.get("broken-frontmatter.md")?.code).toBe("invalid-frontmatter")
  expect(byRelativePath.get("unknown-key.md")?.code).toBe("invalid-frontmatter")
  expect(byRelativePath.get("empty-template.md")?.code).toBe("invalid-frontmatter")
  expect(byRelativePath.get("Invalid Name.md")?.code).toBe("invalid-name")
  expect(byRelativePath.get("binary.md")?.code).toBe("binary-content")
  expect(byRelativePath.get("notes.txt")).toBeUndefined()

  for (const diagnostic of catalog.data.diagnostics) {
    expect(diagnostic.precedence).toBe(diagnostic.source === "global" ? 0 : 1)
    expect(path.isAbsolute(diagnostic.path)).toBe(true)
  }
  const names = catalog.data.commands.map(({ name }) => name)
  expect(names).not.toContain("no-frontmatter")
  expect(names).not.toContain("binary")
})

test("the digest changes when a discovered template changes and returns after it is restored", async () => {
  const before = await commandCatalogDiscover({ globalCommandsPath, projectRoot })
  expect(before.success).toBe(true)
  if (!before.success) return

  await writeCommand(projectCommandsPath, "review.md", ["description: Review a change"], "Changed template.")
  const changed = await commandCatalogDiscover({ globalCommandsPath, projectRoot })
  expect(changed.success).toBe(true)
  if (!changed.success) return
  expect(changed.data.digest).not.toBe(before.data.digest)

  await writeCommand(
    projectCommandsPath,
    "review.md",
    ["description: Review a change", "agent: reviewer", "model: cliproxyapi/opus", "subtask: true"],
    "Review $1 and $2.",
  )
  const restored = await commandCatalogDiscover({ globalCommandsPath, projectRoot })
  expect(restored.success).toBe(true)
  if (!restored.success) return
  expect(restored.data.digest).toBe(before.data.digest)
})

test("a missing global root is not an error and yields only project commands", async () => {
  const catalog = await commandCatalogDiscover({
    globalCommandsPath: path.join(rootDirectory, "absent", "commands"),
    projectRoot,
  })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return
  expect(catalog.data.commands.every(({ source }) => source === "project")).toBe(true)
  expect(catalog.data.roots.map(({ source }) => source)).toEqual(["global", "project"])
})

test("the discovered catalog is frozen and rejects an invalid project root", async () => {
  const catalog = await commandCatalogDiscover({ globalCommandsPath, projectRoot })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return
  expect(Object.isFrozen(catalog.data)).toBe(true)
  expect(Object.isFrozen(catalog.data.commands)).toBe(true)

  const invalid = await commandCatalogDiscover({
    globalCommandsPath,
    projectRoot: path.join(rootDirectory, "does-not-exist"),
  })
  expect(invalid).toMatchObject({ success: false })
})

test("a project command root outside the project root is rejected", async () => {
  const rejected = await commandCatalogDiscover({
    globalCommandsPath,
    projectCommandsPath: globalCommandsPath,
    projectRoot,
  })
  expect(rejected).toMatchObject({ success: false })
})

test("symbolic links are reported instead of followed", async () => {
  const linkRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-command-symlink-"))
  const linkProjectRoot = path.join(linkRoot, "project")
  const linkCommands = path.join(linkProjectRoot, ".agents", "commands")
  await fs.mkdir(linkCommands, { recursive: true })
  await writeCommand(linkCommands, "real.md", ["description: Real"], "Real template.")
  await fs.symlink(path.join(linkCommands, "real.md"), path.join(linkCommands, "linked.md"))

  const catalog = await commandCatalogDiscover({
    globalCommandsPath: path.join(linkRoot, "absent"),
    projectRoot: linkProjectRoot,
  })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return
  expect(catalog.data.commands.map(({ name }) => name)).toEqual(["real"])
  expect(catalog.data.diagnostics.find(({ relativePath }) => relativePath === "linked.md")?.code).toBe("symbolic-link")

  await fs.rm(linkRoot, { force: true, recursive: true })
})

test("command and byte limits are enforced with diagnostics", async () => {
  const limited = await commandCatalogDiscover({ globalCommandsPath, maxCommands: 1, projectRoot })
  expect(limited.success).toBe(true)
  if (!limited.success) return
  expect(limited.data.commands).toHaveLength(1)
  expect(limited.data.diagnostics.some(({ code }) => code === "command-limit-exceeded")).toBe(true)

  const tiny = await commandCatalogDiscover({ globalCommandsPath, maxFileBytes: 1, projectRoot })
  expect(tiny.success).toBe(true)
  if (!tiny.success) return
  expect(tiny.data.commands).toEqual([])
  expect(tiny.data.diagnostics.some(({ code }) => code === "file-too-large")).toBe(true)

  const budget = await commandCatalogDiscover({ globalCommandsPath, maxTotalBytes: 1, projectRoot })
  expect(budget.success).toBe(true)
  if (!budget.success) return
  expect(budget.data.diagnostics.some(({ code }) => code === "total-byte-budget-exceeded")).toBe(true)

  expect(await commandCatalogDiscover({ globalCommandsPath, maxCommands: -1, projectRoot })).toMatchObject({
    success: false,
  })
})

test("the diagnostic limit is reported through a diagnostic-limit-exceeded entry", async () => {
  const catalog = await commandCatalogDiscover({ globalCommandsPath, maxDiagnostics: 2, projectRoot })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return
  expect(catalog.data.diagnostics).toHaveLength(2)
  expect(catalog.data.diagnostics.some(({ code }) => code === "diagnostic-limit-exceeded")).toBe(true)
})
