import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import * as path from "node:path"
import * as v from "valibot"
import { sessionExecutionResourceSummaryCreate } from "../src/session/api/sessionExecutionResourceSummaryCreate.js"
import { sessionExecutionResourceSummarySchema } from "../src/session/api/sessionExecutionResourceSummarySchema.js"
import { sessionShellCreate } from "../src/session/api/sessionShellCreate.js"

const projectRoot = "/workspace/codeline"
const globalRoot = "/home/example/.agents"

const digestCreate = (content: string) => `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`

const skillResourceCreate = (bundleDirectory: string, relativePath: string, content: string) => ({
  canonicalPath: path.resolve(bundleDirectory, ...relativePath.split("/")),
  content,
  digest: digestCreate(content),
  path: relativePath,
  size: Buffer.byteLength(content, "utf8"),
})

function skillSnapshotCreate(input: {
  bundlePath: string
  canonicalPath: string
  description: string
  name: string
  resources?: ReadonlyArray<{ path: string; content: string }>
  source: "global" | "project"
}) {
  const content = `---\nname: ${input.name}\ndescription: ${input.description}\n---\n${input.name} body`
  const bundleDirectory = path.dirname(input.canonicalPath)
  const resources = (input.resources ?? []).map((resource) =>
    skillResourceCreate(bundleDirectory, resource.path, resource.content),
  )
  const digest = digestCreate(content)
  const stable = JSON.stringify({
    description: input.description,
    name: input.name,
    resources: resources.map(({ digest: resourceDigest, path: resourcePath, size }) => ({
      digest: resourceDigest,
      path: resourcePath,
      size,
    })),
    skillDigest: digest,
  })
  return {
    body: `${input.name} body`,
    bundleDigest: digestCreate(stable),
    bundlePath: input.bundlePath,
    canonicalPath: input.canonicalPath,
    content,
    description: input.description,
    digest,
    name: input.name,
    precedence: input.source === "global" ? 0 : 1,
    resources,
    size: Buffer.byteLength(content, "utf8"),
    source: input.source,
  }
}

const instructionSnapshotCreate = (input: {
  canonicalPath: string
  content: string
  scope: string
  source: "global" | "project"
}) => ({
  canonicalPath: input.canonicalPath,
  content: input.content,
  digest: digestCreate(input.content),
  precedence: input.source === "global" ? 0 : 1,
  scope: input.scope,
  size: Buffer.byteLength(input.content, "utf8"),
  source: input.source,
})

const codeStyle = skillSnapshotCreate({
  bundlePath: ".agents/skills/code",
  canonicalPath: `${projectRoot}/.agents/skills/code/SKILL.md`,
  description: "Refactor TypeScript.",
  name: "code-style",
  resources: [{ content: "reference body", path: "reference.md" }],
  source: "project",
})
const agentBrowser = skillSnapshotCreate({
  bundlePath: "global/skills/browser",
  canonicalPath: `${globalRoot}/skills/browser/SKILL.md`,
  description: "Drive a real browser.",
  name: "agent-browser",
  source: "global",
})

const descriptionCatalogContent = [
  "Available skills:",
  "- agent-browser: Drive a real browser.",
  "  location: global/skills/browser",
  "- code-style: Refactor TypeScript.",
  "  location: .agents/skills/code",
].join("\n")

const manifestCreate = (overrides: Record<string, unknown> = {}) => ({
  commandCatalog: { digest: null, version: 1 as const },
  instructions: {
    snapshots: [
      instructionSnapshotCreate({
        canonicalPath: `${globalRoot}/AGENTS.md`,
        content: "global instructions",
        scope: "global",
        source: "global",
      }),
      instructionSnapshotCreate({
        canonicalPath: `${projectRoot}/AGENTS.md`,
        content: "root instructions",
        scope: ".",
        source: "project",
      }),
      instructionSnapshotCreate({
        canonicalPath: `${projectRoot}/src/AGENTS.md`,
        content: "src instructions",
        scope: "src",
        source: "project",
      }),
    ],
    version: 1 as const,
  },
  skills: {
    descriptionCatalog: {
      characterCount: descriptionCatalogContent.length,
      content: descriptionCatalogContent,
      estimatedTokens: Math.ceil(descriptionCatalogContent.length / 4),
      estimatedTokensIsEstimate: true as const,
      skills: [
        { bundlePath: "global/skills/browser", description: "Drive a real browser.", name: "agent-browser" },
        { bundlePath: ".agents/skills/code", description: "Refactor TypeScript.", name: "code-style" },
      ],
      version: 1 as const,
    },
    presetName: "focused",
    snapshots: [agentBrowser, codeStyle],
    version: 1 as const,
  },
  tools: {
    primary: { agentId: "example-agent-primary", tools: ["bash"] },
    selectableSubagents: [{ agentId: "example-agent-explore", tools: ["webfetch", "skill"] }],
  },
  version: 1 as const,
  ...overrides,
})

test("the sanitized summary validates against its contract and keeps the captured preset and tools", () => {
  const summary = sessionExecutionResourceSummaryCreate({
    executionManifest: manifestCreate(),
    projectPath: projectRoot,
  })

  expect(summary.success).toBe(true)
  if (!summary.success) return
  expect(v.safeParse(sessionExecutionResourceSummarySchema, summary.data).success).toBe(true)
  expect(summary.data?.presetName).toBe("focused")
  expect(summary.data?.tools).toEqual({
    primary: { agentId: "example-agent-primary", tools: ["bash"] },
    selectableSubagents: [{ agentId: "example-agent-explore", tools: ["webfetch", "skill"] }],
  })
  expect(summary.data?.descriptionCatalog).toMatchObject({
    characterCount: descriptionCatalogContent.length,
    estimatedTokens: Math.ceil(descriptionCatalogContent.length / 4),
    estimatedTokensIsEstimate: true,
  })
})

test("instruction sources are projected to project-relative paths and a stable global label", () => {
  const summary = sessionExecutionResourceSummaryCreate({
    executionManifest: manifestCreate(),
    projectPath: projectRoot,
  })

  expect(summary.success).toBe(true)
  if (!summary.success) return
  expect(
    summary.data?.instructionSources.map(({ path: sourcePath, scope, source }) => ({ scope, source, sourcePath })),
  ).toEqual([
    { scope: "global", source: "global", sourcePath: "global/AGENTS.md" },
    { scope: ".", source: "project", sourcePath: "AGENTS.md" },
    { scope: "src", source: "project", sourcePath: "src/AGENTS.md" },
  ])
})

test("the sanitized summary never exposes absolute filesystem paths or skill content", () => {
  const summary = sessionExecutionResourceSummaryCreate({
    executionManifest: manifestCreate(),
    projectPath: projectRoot,
  })

  expect(summary.success).toBe(true)
  if (!summary.success) return
  const serialized = JSON.stringify(summary.data)
  expect(serialized).not.toContain(projectRoot)
  expect(serialized).not.toContain(globalRoot)
  expect(serialized).not.toContain("canonicalPath")
  expect(serialized).not.toContain("code-style body")
  expect(serialized).not.toContain("global instructions")
  expect(summary.data?.skills[0]).toEqual({
    bundleDigest: agentBrowser.bundleDigest,
    bundlePath: "global/skills/browser",
    description: "Drive a real browser.",
    digest: agentBrowser.digest,
    name: "agent-browser",
    precedence: 0,
    resources: [],
    size: agentBrowser.size,
    source: "global",
  })
  expect(summary.data?.skills[1]?.resources).toEqual([
    { digest: codeStyle.resources[0]!.digest, path: "reference.md", size: codeStyle.resources[0]!.size },
  ])
})

test("an instruction path outside the project root is reduced to a safe placeholder", () => {
  const manifest = manifestCreate({
    instructions: {
      snapshots: [
        instructionSnapshotCreate({
          canonicalPath: "/elsewhere/AGENTS.md",
          content: "outside instructions",
          scope: "../elsewhere",
          source: "project",
        }),
      ],
      version: 1 as const,
    },
  })
  const summary = sessionExecutionResourceSummaryCreate({ executionManifest: manifest, projectPath: projectRoot })

  expect(summary.success).toBe(true)
  if (!summary.success) return
  expect(summary.data?.instructionSources).toEqual([
    {
      digest: digestCreate("outside instructions"),
      path: "project",
      precedence: 1,
      scope: "project",
      size: Buffer.byteLength("outside instructions", "utf8"),
      source: "project",
      validation: "valid",
    },
  ])
})

test("a session without a captured manifest summarizes to null instead of failing", () => {
  expect(sessionExecutionResourceSummaryCreate({ executionManifest: null, projectPath: projectRoot })).toMatchObject({
    data: null,
    success: true,
  })
  expect(
    sessionExecutionResourceSummaryCreate({ executionManifest: undefined, projectPath: projectRoot }),
  ).toMatchObject({ data: null, success: true })
})

test("an invalid captured manifest is rejected rather than partially projected", () => {
  expect(
    sessionExecutionResourceSummaryCreate({ executionManifest: { version: 1 }, projectPath: projectRoot }),
  ).toMatchObject({ success: false })
})

test("the session shell exposes the sanitized resources alongside the immutable selection", () => {
  const shell = sessionShellCreate({
    archivedAt: null,
    createdAt: "2026-08-26T10:00:00.000Z",
    executionManifest: manifestCreate(),
    executionSelection: {
      tools: {
        primary: { agentId: "example-agent-primary", tools: { bash: true, webfetch: false } },
        selectableSubagents: [{ agentId: "example-agent-explore", tools: { bash: false, webfetch: true } }],
      },
      version: 1,
    },
    id: "example-session",
    metadata: {},
    parentSessionId: null,
    pinned: false,
    primaryAgentId: "example-agent-primary",
    projectPath: projectRoot,
    revision: 1,
    serverId: "example-server",
    title: "Example session",
    updatedAt: "2026-08-26T10:00:00.000Z",
  })

  expect(shell.success).toBe(true)
  if (!shell.success) return
  expect(shell.data.executionResources?.presetName).toBe("focused")
  expect(shell.data.executionResources?.skills.map(({ name }) => name)).toEqual(["agent-browser", "code-style"])
  expect(shell.data.executionSelection?.tools.primary.tools).toEqual({ bash: true, webfetch: false })
  expect(JSON.stringify(shell.data.executionResources)).not.toContain(projectRoot)
})

test("a session shell without a manifest reports null execution resources", () => {
  const shell = sessionShellCreate({
    archivedAt: null,
    createdAt: "2026-08-26T10:00:00.000Z",
    id: "example-session",
    metadata: {},
    parentSessionId: null,
    pinned: false,
    primaryAgentId: "example-agent-primary",
    projectPath: projectRoot,
    revision: 1,
    serverId: "example-server",
    title: "Example session",
    updatedAt: "2026-08-26T10:00:00.000Z",
  })

  expect(shell.success).toBe(true)
  if (!shell.success) return
  expect(shell.data.executionResources).toBeNull()
  expect(shell.data.executionSelection).toBeNull()
})
