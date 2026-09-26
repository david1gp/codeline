import { afterAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { globalAgentFileCatalogRequest } from "../../../src/agents/actions/globalAgentFileCatalogRequest.js"

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "global-agent-files-"))
const skills = path.join(temp, "skills")
const commands = path.join(temp, "commands")
const skillContent = "---\nname: helper\ndescription: Helpful\n---\nDo work.\n"
const commandContent = "---\ndescription: Review\n---\nReview $1.\n"

afterAll(async () => fs.rm(temp, { force: true, recursive: true }))

test("global skill create, list, update, and delete operate only on a valid bundle file", async () => {
  const created = await globalAgentFileCatalogRequest(skills, { kind: "skill", operation: "create", name: "helper", content: skillContent })
  expect(created.success).toBe(true)
  expect(await fs.readFile(path.join(skills, "helper", "SKILL.md"), "utf8")).toBe(skillContent)
  const listed = await globalAgentFileCatalogRequest(skills, { kind: "skill", operation: "list" })
  expect(listed.success ? listed.data.names : undefined).toEqual(["helper"])
  expect(await globalAgentFileCatalogRequest(skills, { kind: "skill", operation: "get", name: "helper" })).toMatchObject({ success: true, data: { content: skillContent } })
  expect((await globalAgentFileCatalogRequest(skills, { kind: "skill", operation: "create", name: "helper", content: skillContent })).success).toBe(false)
  const updated = await globalAgentFileCatalogRequest(skills, { kind: "skill", operation: "update", name: "helper", content: skillContent.replace("Do work.", "Do more work.") })
  expect(updated.success).toBe(true)
  expect((await globalAgentFileCatalogRequest(skills, { kind: "skill", operation: "delete", name: "helper" })).success).toBe(true)
})

test("global commands support nested names and reject invalid content and path names", async () => {
  const created = await globalAgentFileCatalogRequest(commands, { kind: "command", operation: "create", name: "git/review", content: commandContent })
  expect(created.success).toBe(true)
  const listed = await globalAgentFileCatalogRequest(commands, { kind: "command", operation: "list" })
  expect(listed.success ? listed.data.names : undefined).toEqual(["git/review"])
  expect(await globalAgentFileCatalogRequest(commands, { kind: "command", operation: "get", name: "git/review" })).toMatchObject({ success: true, data: { content: commandContent } })
  expect((await globalAgentFileCatalogRequest(commands, { kind: "command", operation: "create", name: "../escape", content: commandContent })).success).toBe(false)
  expect((await globalAgentFileCatalogRequest(commands, { kind: "command", operation: "update", name: "git/review", content: "bad" })).success).toBe(false)
})

test("catalog listing fails closed when its root cannot be listed", async () => {
  const blocked = path.join(temp, "not-a-directory")
  await fs.writeFile(blocked, "file")
  expect((await globalAgentFileCatalogRequest(blocked, { kind: "command", operation: "list" })).success).toBe(false)
})

test("global file writes refuse symlinked targets and enforce the discovery byte limit", async () => {
  await fs.mkdir(path.join(skills, "linked"), { recursive: true })
  const outside = path.join(temp, "outside.md")
  await fs.writeFile(outside, skillContent)
  await fs.rm(path.join(skills, "linked"), { recursive: true })
  await fs.symlink(temp, path.join(skills, "linked"))
  const linked = await globalAgentFileCatalogRequest(skills, { kind: "skill", operation: "create", name: "linked", content: skillContent.replace("helper", "linked") })
  expect(linked.success).toBe(false)
  const large = `${skillContent}${"x".repeat(1_048_576)}`
  expect((await globalAgentFileCatalogRequest(skills, { kind: "skill", operation: "create", name: "large", content: large })).success).toBe(false)
})
