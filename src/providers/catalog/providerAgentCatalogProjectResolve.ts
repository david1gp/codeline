import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { projectDirectoryCanonicalPathResolve } from "../../project/actions/projectDirectoryCanonicalPathResolve.js"
import { type ProviderCatalog, providerCatalogSchema } from "../schema/providerCatalogSchema.js"
import { providerAgentCatalogAgentParse } from "./providerAgentCatalogAgentParse.js"
import { providerAgentCatalogRevision } from "./providerAgentCatalogRevision.js"

export async function providerAgentCatalogProjectResolve(
  projectRoot: string,
  globalCatalog?: ProviderCatalog,
): Promise<Result<{ catalog?: ProviderCatalog; projectAgentIds: string[] }>> {
  const op = "providerAgentCatalogProjectResolve"
  const project = await projectDirectoryCanonicalPathResolve(projectRoot)
  if (!project.success) return createResultError(op, "The project root is invalid.")
  const agentsRoot = path.join(project.data, ".agents", "agents")
  // Inspect both ancestors: a symlink at .agents must not redirect discovery outside the project.
  for (const directory of [path.join(project.data, ".agents"), agentsRoot]) {
    try {
      const stat = await fs.lstat(directory)
      if (!stat.isDirectory() || stat.isSymbolicLink() || (await fs.realpath(directory)) !== directory)
        return createResultError(op, "The project agent directory is unsafe.")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return createResult({ catalog: globalCatalog, projectAgentIds: [] })
      return createResultError(op, "The project agent directory could not be inspected.")
    }
  }
  try {
    const entries = await fs.readdir(agentsRoot, { withFileTypes: true })
    if (entries.length > 100) return createResultError(op, "The project agent directory exceeds its entry budget.")
    const agents: ProviderCatalog["agents"] = []
    let totalBytes = 0
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.name.endsWith(".md")) continue
      if (!entry.isFile() || entry.isSymbolicLink())
        return createResultError(op, "Project agent files must be regular files, not symbolic links.")
      const filePath = path.join(agentsRoot, entry.name)
      if ((await fs.realpath(filePath)) !== filePath) return createResultError(op, "The project agent file is unsafe.")
      const handle = await fs.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > 256_000 || totalBytes + stat.size > 1_000_000)
          return createResultError(op, "The project agent file exceeds its byte budget.")
        const bytes = await handle.readFile()
        totalBytes += bytes.length
        if (bytes.length > 256_000 || totalBytes > 1_000_000 || bytes.includes(0))
          return createResultError(op, "The project agent file is invalid or exceeds its byte budget.")
        let source: string
        try {
          source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        } catch {
          return createResultError(op, "The project agent file is not valid UTF-8.")
        }
        const parsed = providerAgentCatalogAgentParse(entry.name.slice(0, -3), source)
        if (!parsed.success) return createResultError(op, parsed.errorMessage)
        if (agents.some(({ id }) => id === parsed.data.id))
          return createResultError(op, "Project agent IDs must be unique.")
        agents.push(parsed.data)
      } finally {
        await handle.close()
      }
    }
    if (agents.length === 0) return createResult({ catalog: globalCatalog, projectAgentIds: [] })
    if (globalCatalog === undefined) return createResultError(op, "The provider catalog is unavailable.")
    const projectAgentIds = agents.map(({ id }) => id)
    const ids = new Set(projectAgentIds)
    const withoutRevision = {
      agents: [...globalCatalog.agents.filter(({ id }) => !ids.has(id)), ...agents].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      providers: globalCatalog.providers,
    }
    const validated = v.safeParse(providerCatalogSchema, {
      ...withoutRevision,
      revision: providerAgentCatalogRevision(withoutRevision),
    })
    if (!validated.success) return createResultError(op, "The effective project agent catalog is invalid.")
    return createResult({ catalog: validated.output, projectAgentIds })
  } catch {
    return createResultError(op, "The project agent catalog could not be read.")
  }
}
