import { expect, test } from "bun:test"
import * as crypto from "node:crypto"
import * as path from "node:path"
import { agentInstructionsForPathResolve } from "../src/instructions/actions/agentInstructionsForPathResolve.js"
import { agentInstructionsSnapshotResolve } from "../src/instructions/actions/agentInstructionsSnapshotResolve.js"
import type { AgentInstructionSnapshotEntry } from "../src/instructions/schema/agentInstructionSnapshotEntrySchema.js"

function entry(input: {
  canonicalPath: string
  content: string
  precedence: number
  scope: string
  source: "global" | "project"
}): AgentInstructionSnapshotEntry {
  return {
    ...input,
    digest: `sha256-${crypto.createHash("sha256").update(input.content, "utf8").digest("hex")}`,
    size: Buffer.byteLength(input.content, "utf8"),
  }
}

test("resolves instructions deterministically into a deeply immutable snapshot", () => {
  const projectRoot = path.join("/tmp", "codeline-instruction-snapshot-project")
  const globalEntry = entry({
    canonicalPath: path.join("/tmp", "codeline-instruction-snapshot-global", "AGENTS.md"),
    content: "global",
    precedence: 0,
    scope: "global",
    source: "global",
  })
  const rootEntry = entry({
    canonicalPath: path.join(projectRoot, "AGENTS.md"),
    content: "root",
    precedence: 1,
    scope: ".",
    source: "project",
  })
  const docsEntry = entry({
    canonicalPath: path.join(projectRoot, "docs", "AGENTS.md"),
    content: "docs",
    precedence: 2,
    scope: "docs",
    source: "project",
  })
  const srcEntry = entry({
    canonicalPath: path.join(projectRoot, "src", "AGENTS.md"),
    content: "src",
    precedence: 2,
    scope: "src",
    source: "project",
  })
  const deepEntry = entry({
    canonicalPath: path.join(projectRoot, "src", "deep", "AGENTS.md"),
    content: "deep",
    precedence: 3,
    scope: "src/deep",
    source: "project",
  })
  const input = {
    diagnostics: [],
    snapshots: [deepEntry, srcEntry, globalEntry, docsEntry, rootEntry],
    version: 1 as const,
  }

  const resolved = agentInstructionsSnapshotResolve(input)

  expect(resolved).toMatchObject({
    success: true,
    data: {
      snapshots: [globalEntry, rootEntry, docsEntry, srcEntry, deepEntry],
      version: 1,
    },
  })
  expect(input.snapshots).toEqual([deepEntry, srcEntry, globalEntry, docsEntry, rootEntry])
  if (!resolved.success) return

  input.snapshots[0] = { ...input.snapshots[0]!, content: "changed after resolution" }
  expect(resolved.data.snapshots[4]?.content).toBe("deep")
  expect(Object.isFrozen(resolved.data)).toBe(true)
  expect(Object.isFrozen(resolved.data.snapshots)).toBe(true)
  expect(resolved.data.snapshots.every((snapshot) => Object.isFrozen(snapshot))).toBe(true)

  const root = agentInstructionsForPathResolve({
    projectRoot,
    snapshot: resolved.data,
    workingDirectory: projectRoot,
  })
  expect(root).toMatchObject({
    success: true,
    data: {
      baseline: "global\n\nroot",
      overlay: "",
      overlays: [],
      rendered: "global\n\nroot",
    },
  })

  const nested = agentInstructionsForPathResolve({
    projectRoot,
    snapshot: resolved.data,
    workingDirectory: path.join(projectRoot, "src", "deep"),
  })
  expect(nested).toMatchObject({
    success: true,
    data: {
      baseline: "global\n\nroot",
      overlay: "src\n\ndeep",
      overlays: [srcEntry, deepEntry],
      rendered: "global\n\nroot\n\nsrc\n\ndeep",
    },
  })
  if (!nested.success) return
  expect(Object.isFrozen(nested.data)).toBe(true)
  expect(Object.isFrozen(nested.data.overlays)).toBe(true)
  expect(nested.data.overlays.every((snapshot) => Object.isFrozen(snapshot))).toBe(true)

  const sibling = agentInstructionsForPathResolve({
    projectRoot,
    snapshot: resolved.data,
    workingDirectory: "docs",
  })
  expect(sibling).toMatchObject({
    success: true,
    data: { baseline: "global\n\nroot", overlay: "docs", rendered: "global\n\nroot\n\ndocs" },
  })
})

test("uses only the snapshotted contents and accepts resolved snapshots without discovery diagnostics", () => {
  const projectRoot = path.join("/tmp", "codeline-instruction-snapshot-stable")
  const rootEntry = entry({
    canonicalPath: path.join(projectRoot, "AGENTS.md"),
    content: "original root",
    precedence: 1,
    scope: ".",
    source: "project",
  })
  const resolved = agentInstructionsSnapshotResolve({ snapshots: [rootEntry], version: 1 })
  expect(resolved.success).toBe(true)
  if (!resolved.success) return

  const pathResolution = agentInstructionsForPathResolve({
    projectRoot,
    snapshot: resolved.data,
    workingDirectory: ".",
  })
  expect(pathResolution).toMatchObject({ success: true, data: { rendered: "original root" } })

  const discoveredShape = agentInstructionsSnapshotResolve({ diagnostics: [], snapshots: [rootEntry], version: 1 })
  expect(discoveredShape).toMatchObject({ success: true, data: { snapshots: [rootEntry], version: 1 } })
})

test("rejects invalid snapshots and unsafe scoped paths before rendering overlays", () => {
  const projectRoot = path.join("/tmp", "codeline-instruction-snapshot-invalid")
  const valid = entry({
    canonicalPath: path.join(projectRoot, "AGENTS.md"),
    content: "valid",
    precedence: 1,
    scope: ".",
    source: "project",
  })

  expect(
    agentInstructionsSnapshotResolve({
      snapshots: [valid, { ...valid }],
      version: 1,
    }),
  ).toMatchObject({ success: false })
  expect(
    agentInstructionsSnapshotResolve({
      snapshots: [{ ...valid, digest: `sha256-${"0".repeat(64)}` }],
      version: 1,
    }),
  ).toMatchObject({ success: false })
  expect(agentInstructionsSnapshotResolve({ snapshots: [], version: 2 })).toMatchObject({ success: false })

  for (const scope of ["../escape", "/absolute", "src//nested", "src\\nested"]) {
    const unsafe = entry({
      canonicalPath: path.join(projectRoot, "AGENTS.md"),
      content: "unsafe scope",
      precedence: 2,
      scope,
      source: "project",
    })
    expect(
      agentInstructionsForPathResolve({
        projectRoot,
        snapshot: { snapshots: [unsafe], version: 1 },
        workingDirectory: ".",
      }),
    ).toMatchObject({ success: false })
  }
  expect(
    agentInstructionsForPathResolve({
      projectRoot,
      snapshot: { snapshots: [valid], version: 1 },
      workingDirectory: "../outside",
    }),
  ).toMatchObject({ success: false })
})
