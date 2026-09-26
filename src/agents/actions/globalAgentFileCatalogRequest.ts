import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { randomUUID } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { parseDocument } from "yaml"
import { commandFrontmatterSchema } from "../../commands/schema/commandFrontmatterSchema.js"
import { commandNameSchema } from "../../commands/schema/commandNameSchema.js"
import { skillFrontmatterSchema } from "../../skills/schema/skillFrontmatterSchema.js"
import { skillDiscoveryLimits } from "../../skills/skillDiscoveryLimits.js"

export type GlobalAgentFileKind = "command" | "skill"
export type GlobalAgentFileOperation =
  | { kind: GlobalAgentFileKind; operation: "list" }
  | { kind: GlobalAgentFileKind; name: string; operation: "get" }
  | { content: string; kind: GlobalAgentFileKind; name: string; operation: "create" | "update" }
  | { kind: GlobalAgentFileKind; name: string; operation: "delete" }

const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const maxBytes = skillDiscoveryLimits.maximumFileBytes

function validContent(kind: GlobalAgentFileKind, name: string, content: string): boolean {
  if (Buffer.byteLength(content, "utf8") > maxBytes || content.includes("\0")) return false
  const lines = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
  if (lines[0] !== "---") return false
  const end = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."))
  if (end < 0) return false
  try {
    const doc = parseDocument(lines.slice(1, end).join("\n"), { uniqueKeys: true })
    if (doc.errors.length || !doc.contents) return false
    const data = doc.toJS({ mapAsMap: false })
    if (typeof data !== "object" || data === null || Array.isArray(data)) return false
    if (kind === "skill") {
      const parsed = v.safeParse(skillFrontmatterSchema, data)
      return parsed.success && parsed.output.name === name
    }
    return v.safeParse(commandFrontmatterSchema, data).success
  } catch (_error) {
    return false
  }
}

function targetPath(root: string, kind: GlobalAgentFileKind, name: string): string | undefined {
  if (!(kind === "skill" ? skillName.test(name) : v.safeParse(commandNameSchema, name).success)) return undefined
  const target = kind === "skill" ? path.join(root, name, "SKILL.md") : path.join(root, `${name}.md`)
  const relative = path.relative(root, target)
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return undefined
  return target
}

async function pathCheck(root: string, target: string): Promise<boolean> {
  const absoluteRoot = path.resolve(root)
  let current = absoluteRoot
  const relative = path.relative(absoluteRoot, path.dirname(target))
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false
    }
  }
  try {
    const stat = await fs.lstat(target)
    return stat.isFile() && !stat.isSymbolicLink()
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
  }
}

async function boundedContentRead(target: string): Promise<string | undefined> {
  try {
    const stat = await fs.lstat(target)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) return undefined
    return await fs.readFile(target, "utf8")
  } catch (_error) {
    return undefined
  }
}

async function atomicWrite(target: string, content: string, create: boolean): Promise<void> {
  const directory = path.dirname(target)
  const temporary = path.join(directory, `.global-agent-${process.pid}-${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 })
    if (create) await fs.link(temporary, target)
    else await fs.rename(temporary, target)
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
}

export async function globalAgentFileCatalogRequest(
  root: string,
  request: GlobalAgentFileOperation,
): Promise<Result<{ content?: string; names?: string[] }>> {
  const op = "globalAgentFileCatalogRequest"
  try {
    const canonicalRoot = path.resolve(
      root === "~" ? os.homedir() : root.startsWith("~/") ? path.join(os.homedir(), root.slice(2)) : root,
    )
    try {
      if ((await fs.lstat(canonicalRoot)).isSymbolicLink())
        return createResultError(op, "The global resource root is unsafe.")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        return createResultError(op, "The global resource root is unsafe.")
    }
    if (request.operation === "list") {
      const names: string[] = []
      const walk = async (directory: string, prefix = ""): Promise<void> => {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue
          const name = prefix ? `${prefix}/${entry.name}` : entry.name
          if (entry.isDirectory() && request.kind === "command") await walk(path.join(directory, entry.name), name)
          else if (request.kind === "skill" && entry.isDirectory()) {
            const file = path.join(directory, entry.name, "SKILL.md")
            const target = targetPath(canonicalRoot, request.kind, entry.name)
            if (!target || !(await pathCheck(canonicalRoot, target))) continue
            const content = await boundedContentRead(file)
            if (content !== undefined && validContent(request.kind, entry.name, content)) names.push(entry.name)
          } else if (request.kind === "command" && entry.isFile() && name.endsWith(".md")) {
            const command = name.slice(0, -3)
            const target = targetPath(canonicalRoot, request.kind, command)
            if (!target || !(await pathCheck(canonicalRoot, target))) continue
            const content = await boundedContentRead(target)
            if (content !== undefined && validContent(request.kind, command, content)) names.push(command)
          }
        }
      }
      await fs.mkdir(canonicalRoot, { recursive: true })
      await walk(canonicalRoot)
      return createResult({ names: names.sort() })
    }
    const target = targetPath(canonicalRoot, request.kind, request.name)
    if (!target) return createResultError(op, "The resource name is invalid.")
    if (request.operation === "get") {
      if (!(await pathCheck(canonicalRoot, target)))
        return createResultError(op, "The resource was not found or is unsafe.")
      const content = await boundedContentRead(target)
      if (content === undefined || !validContent(request.kind, request.name, content))
        return createResultError(op, "The resource was not found or is invalid.")
      return createResult({ content })
    }
    if (request.operation === "delete") {
      if (!(await pathCheck(canonicalRoot, target)))
        return createResultError(op, "The resource was not found or is unsafe.")
      await fs.unlink(target)
      return createResult({})
    }
    if (!validContent(request.kind, request.name, request.content))
      return createResultError(op, "The resource content is invalid or exceeds the size limit.")
    await fs.mkdir(path.dirname(target), { recursive: true })
    if (!(await pathCheck(canonicalRoot, target))) return createResultError(op, "The resource path is unsafe.")
    if (request.operation === "create") {
      const files = await globalAgentFileCatalogRequest(canonicalRoot, { kind: request.kind, operation: "list" })
      if (!files.success) return createResultError(op, "The global resource catalog could not be listed.")
      if (files.data.names?.includes(request.name)) return createResultError(op, "The resource name already exists.")
      await atomicWrite(target, request.content, true)
    } else {
      const current = await boundedContentRead(target)
      if (current === undefined || !validContent(request.kind, request.name, current))
        return createResultError(op, "The resource was not found or is invalid.")
      await atomicWrite(target, request.content, false)
    }
    return createResult({ content: request.content })
  } catch (_error) {
    return createResultError(op, "The global resource could not be accessed.")
  }
}
