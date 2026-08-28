import { afterAll, beforeAll, expect, test } from "bun:test"
import * as crypto from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { agentInstructionInspectionResponseSchema } from "../src/instructions/api/agentInstructionInspectionResponseSchema.js"
import { apiAgentInstructionRoutesAdd } from "../src/instructions/api/apiAgentInstructionRoutesAdd.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"

let projectsRoot: string
let projectRoot: string
let globalRoot: string
let projectId: string
let app: Hono<AppEnvironment>

function digest(content: string): string {
  return `sha256-${crypto.createHash("sha256").update(content, "utf8").digest("hex")}`
}

beforeAll(async () => {
  projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-instruction-api-projects-"))
  projectRoot = path.join(projectsRoot, "example-project")
  globalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-instruction-api-global-"))
  await fs.mkdir(path.join(projectRoot, "nested"), { recursive: true })
  await fs.writeFile(path.join(globalRoot, "AGENTS.md"), "global instruction content", "utf8")
  await fs.writeFile(path.join(projectRoot, "AGENTS.md"), "project instruction content", "utf8")
  await fs.writeFile(path.join(projectRoot, "nested", "AGENTS.md"), "nested instruction content", "utf8")

  app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "instruction-api-user" })
    await next()
  })
  apiProjectRoutesAdd(app, { rootDirs: [projectsRoot] })
  apiAgentInstructionRoutesAdd(app, { globalAgentsPath: path.join(globalRoot, "AGENTS.md"), rootDirs: [projectsRoot] })
  const list = await app.request("https://codeline.test/project/list")
  projectId = (await list.json()).projects[0].id
})

afterAll(async () => {
  await Promise.all([
    fs.rm(projectsRoot, { force: true, recursive: true }),
    fs.rm(globalRoot, { force: true, recursive: true }),
  ])
})

test("serves authenticated instruction inspection with editable content and canonical paths", async () => {
  const response = await app.request(`https://codeline.test/agent-instructions?project=${projectId}`)

  expect(response.status).toBe(200)
  const body = await response.json()
  expect(v.safeParse(agentInstructionInspectionResponseSchema, body).success).toBe(true)
  expect(body).toMatchObject({
    diagnostics: [],
    projectId,
    snapshots: [
      {
        canonicalPath: path.join(globalRoot, "AGENTS.md"),
        content: "global instruction content",
        digest: digest("global instruction content"),
        path: "global/AGENTS.md",
        scope: "global",
        source: "global",
        validation: "valid",
      },
      {
        canonicalPath: path.join(projectRoot, "AGENTS.md"),
        content: "project instruction content",
        digest: digest("project instruction content"),
        path: "AGENTS.md",
        scope: ".",
        source: "project",
        validation: "valid",
      },
    ],
    version: 1,
  })
  expect(body.snapshots[0]?.content).toBe("global instruction content")
  expect(body.snapshots[0]?.canonicalPath).toBe(path.join(globalRoot, "AGENTS.md"))
})

test("requires authentication and a valid discovered project", async () => {
  const unauthenticated = new Hono<AppEnvironment>()
  apiAgentInstructionRoutesAdd(unauthenticated, { rootDirs: [projectsRoot] })
  const unauthorizedResponse = await unauthenticated.request("https://codeline.test/agent-instructions")
  expect(unauthorizedResponse.status).toBe(401)
  expect(await unauthorizedResponse.json()).toEqual({
    error: { code: "unauthorized", message: "Authentication is required." },
  })

  const missingProject = await app.request("https://codeline.test/agent-instructions")
  expect(missingProject.status).toBe(400)
  const malformedProject = await app.request("https://codeline.test/agent-instructions?project=not-a-project")
  expect(malformedProject.status).toBe(400)
  const unknownProject = await app.request(`https://codeline.test/agent-instructions?project=${"0".repeat(64)}`)
  expect(unknownProject.status).toBe(404)
})

test("returns an internal error when server-owned discovery fails", async () => {
  const failedApp = new Hono<AppEnvironment>()
  failedApp.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "instruction-api-user" })
    await next()
  })
  apiAgentInstructionRoutesAdd(failedApp, {
    agentInstructionsDiscover: async () => createResultError("testDiscovery", "discovery failed"),
    rootDirs: [projectsRoot],
  })

  const response = await failedApp.request(`https://codeline.test/agent-instructions?project=${projectId}`)

  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    error: { code: "internal_server_error", message: "The agent instructions could not be inspected." },
  })
})

test("sanitizes malicious diagnostic paths and scopes before returning inspection data", async () => {
  const unsafeApp = new Hono<AppEnvironment>()
  unsafeApp.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "instruction-api-user" })
    await next()
  })
  apiAgentInstructionRoutesAdd(unsafeApp, {
    agentInstructionsDiscover: async () =>
      createResult({
        diagnostics: [
          {
            code: "file-unavailable",
            message: "unsafe project diagnostic",
            path: "/etc/passwd",
            precedence: 2,
            scope: "../outside",
            source: "project",
          },
          {
            code: "symbolic-link",
            message: "unsafe global diagnostic",
            path: path.join(globalRoot, "AGENTS.md"),
            precedence: 0,
            scope: "../../outside",
            source: "global",
          },
        ],
        snapshots: [
          {
            canonicalPath: path.join(projectRoot, "AGENTS.md"),
            content: "safe content",
            digest: digest("safe content"),
            precedence: 1,
            scope: ".",
            size: Buffer.byteLength("safe content", "utf8"),
            source: "project",
          },
        ],
        version: 1,
      }),
    rootDirs: [projectsRoot],
  })

  const response = await unsafeApp.request(`https://codeline.test/agent-instructions?project=${projectId}`)

  expect(response.status).toBe(200)
  const body = await response.json()
  expect(v.safeParse(agentInstructionInspectionResponseSchema, body).success).toBe(true)
  expect(body.diagnostics).toEqual([
    {
      code: "file-unavailable",
      message: "The AGENTS.md file could not be inspected.",
      path: "project",
      precedence: 2,
      scope: "project",
      source: "project",
      validation: "invalid",
    },
    {
      code: "symbolic-link",
      message: "AGENTS.md must not be a symbolic link.",
      path: "global/AGENTS.md",
      precedence: 0,
      scope: "global",
      source: "global",
      validation: "invalid",
    },
  ])
  expect(JSON.stringify(body)).not.toContain("/etc/passwd")
  expect(JSON.stringify(body)).not.toContain("..")
  expect(JSON.stringify(body)).not.toContain("\\")
})
