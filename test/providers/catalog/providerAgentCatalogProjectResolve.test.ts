import { expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { providerAgentCatalogLoad } from "../../../src/providers/catalog/providerAgentCatalogLoad.js"
import { providerAgentCatalogProjectResolve } from "../../../src/providers/catalog/providerAgentCatalogProjectResolve.js"

test("project agent files override global agents by ID and retain global models", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-agent-"))
  try {
    const directory = path.join(root, ".agents", "agents")
    await fs.mkdir(directory, { recursive: true })
    const global = await providerAgentCatalogLoad(path.resolve(import.meta.dir, "../../.."))
    expect(global.success).toBe(true)
    if (!global.success) return
    const collision = global.data.agents[0]
    expect(collision).toBeDefined()
    if (collision === undefined) return
    await fs.writeFile(path.join(directory, `${collision.id}.md`), "---\nmode: subagent\ntools:\n  bash: true\n  webfetch: false\n---\nProject prompt")
    await fs.writeFile(path.join(directory, "local.md"), "---\nmode: subagent\n---\nLocal prompt")
    const resolved = await providerAgentCatalogProjectResolve(root, global.data)
    expect(resolved.success).toBe(true)
    if (!resolved.success) return
    expect(resolved.data.projectAgentIds).toEqual(["local", collision.id].sort())
    expect(resolved.data.catalog?.agents.filter(({ id }) => id === collision.id)).toEqual([expect.objectContaining({ prompt: "Project prompt" })])
    expect(resolved.data.catalog?.agents.find(({ id }) => id === "local")?.prompt).toBe("Local prompt")
    expect(resolved.data.catalog?.providers).toEqual(global.data.providers)
    expect(resolved.data.catalog?.revision).not.toEqual(global.data.revision)
  } finally {
    await fs.rm(root, { force: true, recursive: true })
  }
})

test("project agent discovery rejects symlink roots, symlink files, malformed agents and invalid UTF-8", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-agent-unsafe-"))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-agent-outside-"))
  try {
    const parent = path.join(root, ".agents")
    await fs.symlink(outside, parent)
    expect((await providerAgentCatalogProjectResolve(root)).success).toBe(false)
    await fs.unlink(parent)
    const directory = path.join(parent, "agents")
    await fs.mkdir(directory, { recursive: true })
    await fs.symlink(path.join(outside, "outside.md"), path.join(directory, "unsafe.md"))
    expect((await providerAgentCatalogProjectResolve(root)).success).toBe(false)
    await fs.unlink(path.join(directory, "unsafe.md"))
    await fs.writeFile(path.join(directory, "bad.md"), "---\nmode: invalid\n---\nPrompt")
    expect((await providerAgentCatalogProjectResolve(root)).success).toBe(false)
    await fs.writeFile(path.join(directory, "bad.md"), Buffer.from([0xff, 0xfe]))
    expect((await providerAgentCatalogProjectResolve(root)).success).toBe(false)
  } finally {
    await fs.rm(root, { force: true, recursive: true })
    await fs.rm(outside, { force: true, recursive: true })
  }
})
