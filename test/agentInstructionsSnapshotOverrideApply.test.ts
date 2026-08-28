import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { agentInstructionDiscoveryLimits } from "../src/instructions/agentInstructionDiscoveryLimits.js"
import { agentInstructionsSnapshotOverrideApply } from "../src/instructions/actions/agentInstructionsSnapshotOverrideApply.js"
import { sessionCreateRequestSchema } from "../src/session/schema/sessionCreateRequestSchema.js"
import { sessionInstructionOverridesSchema } from "../src/session/schema/sessionInstructionOverridesSchema.js"
import * as v from "valibot"

const digestCreate = (content: string) => `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`

const snapshotCreate = (content: string, canonicalPath: string, source: "global" | "project", precedence: number) => ({
  canonicalPath,
  content,
  digest: digestCreate(content),
  precedence,
  scope: source === "global" ? "global" : ".",
  size: Buffer.byteLength(content, "utf8"),
  source,
})

const snapshot = {
  diagnostics: [],
  snapshots: [
    snapshotCreate("global instructions", "/home/example/.agents/AGENTS.md", "global", 0),
    snapshotCreate("project instructions", "/workspace/project/AGENTS.md", "project", 1),
  ],
  version: 1 as const,
}

test("session creation schema preserves omitted and explicitly empty prompts", () => {
  const omitted = v.safeParse(sessionCreateRequestSchema, {
    clientRequestId: "request-omitted-prompt",
    primaryAgentId: "agent",
    serverId: "server",
    title: "Session",
  })
  const explicitEmpty = v.safeParse(sessionCreateRequestSchema, {
    agentPrompt: "",
    clientRequestId: "request-empty-prompt",
    primaryAgentId: "agent",
    serverId: "server",
    title: "Session",
  })

  expect(omitted.success).toBe(true)
  if (omitted.success) expect(omitted.output.agentPrompt).toBeUndefined()
  expect(explicitEmpty.success).toBe(true)
  if (explicitEmpty.success) expect(explicitEmpty.output.agentPrompt).toBe("")
})

test("session creation schema accepts a prompt and sparse instruction overrides", () => {
  const parsed = v.safeParse(sessionCreateRequestSchema, {
    agentPrompt: "Use the captured prompt.",
    clientRequestId: "request",
    instructionOverrides: { "/workspace/project/AGENTS.md": "Use the edited instructions." },
    primaryAgentId: "agent",
    serverId: "server",
    title: "Session",
  })

  expect(parsed.success).toBe(true)
  expect(v.safeParse(sessionInstructionOverridesSchema, { "/workspace/project/AGENTS.md": "edited" }).success).toBe(
    true,
  )
})

test("instruction overrides preserve server metadata and recompute UTF-8 size and digest", () => {
  const content = "Use café instructions."
  const resolved = agentInstructionsSnapshotOverrideApply({
    overrides: { "/workspace/project/AGENTS.md": content },
    snapshot,
  })

  expect(resolved.success).toBe(true)
  if (!resolved.success) return
  const globalEntry = snapshot.snapshots[0]
  const projectEntry = snapshot.snapshots[1]
  if (globalEntry === undefined || projectEntry === undefined) return
  expect(resolved.data.snapshots).toEqual([
    globalEntry,
    {
      ...projectEntry,
      content,
      digest: digestCreate(content),
      size: Buffer.byteLength(content, "utf8"),
    },
  ])
  expect(resolved.data.snapshots[1]).toMatchObject({ precedence: 1, scope: ".", source: "project" })
  expect(Object.isFrozen(resolved.data)).toBe(true)
})

test("instruction overrides reject unknown paths and content over the existing file limit", () => {
  expect(
    agentInstructionsSnapshotOverrideApply({
      overrides: { "/workspace/project/other/AGENTS.md": "unknown" },
      snapshot,
    }),
  ).toMatchObject({ success: false, errorMessage: "The instruction override path is not a discovered AGENTS.md path." })

  expect(
    agentInstructionsSnapshotOverrideApply({
      overrides: { "/workspace/project/AGENTS.md": "x".repeat(agentInstructionDiscoveryLimits.maximumFileBytes + 1) },
      snapshot,
    }),
  ).toMatchObject({ success: false, errorMessage: "The session instruction overrides are invalid." })
})

test("instruction overrides recheck the aggregate snapshot byte limit", () => {
  const content = "x".repeat(Math.floor(agentInstructionDiscoveryLimits.maximumTotalBytes / 5))
  const snapshots = Array.from({ length: 5 }, (_, index) =>
    snapshotCreate(content, `/workspace/project/${index}/AGENTS.md`, "project", index + 1),
  )
  const input = { diagnostics: [], snapshots, version: 1 as const }
  const resolved = agentInstructionsSnapshotOverrideApply({
    overrides: { "/workspace/project/0/AGENTS.md": "x".repeat(agentInstructionDiscoveryLimits.maximumFileBytes) },
    snapshot: input,
  })

  expect(resolved).toMatchObject({
    success: false,
    errorMessage: "The instruction overrides exceed the agent instruction snapshot limits.",
  })
})
