import { afterEach, expect, test } from "bun:test"
import * as crypto from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import type { CodelineConfigurationDocument } from "../src/configuration/codelineConfigurationDocumentSchema.js"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { configurationStoreRead } from "../src/configuration/configurationStoreRead.js"
import { configurationStoreWrite } from "../src/configuration/configurationStoreWrite.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { runExecutionSnapshotResolve } from "../src/run/actions/runExecutionSnapshotResolve.js"
import { runErrorCodes } from "../src/run/errors/runErrorCodes.js"

const tmpRoot = Bun.env.TMPDIR ?? "/tmp"
const directories: string[] = []

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpRoot, "codeline-run-snapshot-"))
  directories.push(directory)
  return directory
}

async function createStore() {
  const result = await configurationStoreCreate({
    authorEmail: "run-snapshot-test@example.com",
    authorName: "Codeline Run Snapshot Test",
    branch: "main",
    dir: tempDirectory(),
  })
  if (!result.success) throw new Error(result.errorMessage)
  return result.data
}

function configuration(model: string): CodelineConfigurationDocument {
  return {
    agentConfigurations: [
      {
        configuration: { model: "other-model", provider: "deterministic" },
        target: { agentId: "other-agent", serverId: "other-server" },
      },
      {
        configuration: {
          apiKey: "$CODEX_LB_API_TOKEN",
          baseUrl: "https://provider.example.test/v1",
          generation: { maxTokens: 512, temperature: 0.2 },
          model,
          provider: "codex-lb",
        },
        target: { agentId: "agent-1", serverId: "server-1" },
      },
    ],
    version: 1,
  }
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory !== undefined) rmSync(directory, { force: true, recursive: true })
  }
})

test("run execution snapshot resolves the committed target configuration and revision", async () => {
  const store = await createStore()
  const written = await configurationStoreWrite(store, configuration("committed-model"))
  expect(written.success).toBe(true)
  if (!written.success) return

  const resolved = runExecutionSnapshotResolve({ agentId: "agent-1", serverId: "server-1" }, store)

  expect(resolved).toEqual({
    success: true,
    data: {
      configuration: {
        apiKey: "$CODEX_LB_API_TOKEN",
        baseUrl: "https://provider.example.test/v1",
        generation: { maxTokens: 512, temperature: 0.2 },
        model: "committed-model",
        provider: "codex-lb",
        tools: { bash: false, webfetch: false },
      },
      configurationRevision: written.data,
      executionManifest: {
        commandCatalog: { digest: null, version: 1 },
        instructions: { snapshots: [], version: 1 },
        skills: { snapshots: [], version: 1 },
        tools: { primary: { agentId: "agent-1", tools: ["skill", "delegate_task"] }, selectableSubagents: [] },
        version: 1,
      },
      target: { agentId: "agent-1", serverId: "server-1" },
    },
  })
  if (!resolved.success) return
  expect(Object.isFrozen(resolved.data)).toBe(true)
  expect(Object.isFrozen(resolved.data.configuration)).toBe(true)
  expect(Object.isFrozen(resolved.data.target)).toBe(true)
  expect(resolved.data.executionManifest).toBeDefined()
  if (resolved.data.executionManifest !== undefined) {
    expect(Object.isFrozen(resolved.data.executionManifest)).toBe(true)
    expect(Object.isFrozen(resolved.data.executionManifest.tools)).toBe(true)
  }
})

test("run execution snapshot stays independent across committed configuration changes", async () => {
  const store = await createStore()
  const first = await configurationStoreWrite(store, configuration("first-model"))
  expect(first.success).toBe(true)
  if (!first.success) return

  const resolved = runExecutionSnapshotResolve({ agentId: "agent-1", serverId: "server-1" }, store)
  expect(resolved.success).toBe(true)
  if (!resolved.success) return

  const second = await configurationStoreWrite(store, configuration("second-model"))
  expect(second.success).toBe(true)
  if (!second.success) return

  expect(resolved.data.configuration.model).toBe("first-model")
  expect(resolved.data.configurationRevision).toBe(first.data)
  expect(second.data).not.toBe(first.data)
})

test("run execution snapshot exposes target and configuration-reader seams", async () => {
  const store = await createStore()
  const written = await configurationStoreWrite(store, configuration("seam-model"))
  expect(written.success).toBe(true)
  if (!written.success) return

  let readCount = 0
  const resolved = runExecutionSnapshotResolve({ agentId: "agent-1", serverId: "server-1" }, store, {
    configurationStoreRead: (input) => {
      readCount += 1
      return configurationStoreRead(input)
    },
  })

  expect(resolved.success).toBe(true)
  expect(readCount).toBe(1)
})

test("run execution snapshot rejects an unconfigured session target", async () => {
  const store = await createStore()
  const written = await configurationStoreWrite(store, configuration("configured-model"))
  expect(written.success).toBe(true)
  if (!written.success) return

  expect(runExecutionSnapshotResolve({ agentId: "missing-agent", serverId: "server-1" }, store)).toMatchObject({
    code: runErrorCodes.executionTargetUnconfigured,
    errorMessage: "The run execution target is not configured.",
    success: false,
  })
})

test("run execution snapshot freezes the catalog revision, model metadata, prompt, and override", async () => {
  const store = await createStore()
  const written = await configurationStoreWrite(store, {
    agentConfigurations: [
      {
        configuration: { model: "legacy-model", provider: "deterministic" },
        target: { agentId: "build", serverId: "server-1" },
      },
    ],
    version: 1,
  })
  expect(written.success).toBe(true)
  if (!written.success) return

  const catalogResult = await providerAgentCatalogLoad(process.cwd())
  expect(catalogResult.success).toBe(true)
  if (!catalogResult.success) return

  const resolved = runExecutionSnapshotResolve({ agentId: "build", serverId: "server-1" }, store, {
    catalog: catalogResult.data,
    execution: { model: "grok-4.5", provider: "cliproxyapi", reasoningEffort: "high" },
  })

  expect(resolved).toMatchObject({
    success: true,
    data: {
      agentPrompt: expect.stringContaining("Complete the user's software task directly."),
      catalogRevision: catalogResult.data.revision,
      configuration: { model: "grok-4.5", provider: "cliproxyapi" },
      modelMetadata: { id: "grok-4.5" },
    },
  })
  if (!resolved.success) return
  expect(Object.isFrozen(resolved.data.modelMetadata)).toBe(true)
  expect(Object.isFrozen(resolved.data.configuration)).toBe(true)
  if (resolved.data.configuration.provider === "cliproxyapi")
    expect(resolved.data.configuration.apiKey).toBe("$SUBS_CONTENTOREN_DE_API_KEY")
  const buildAgent = catalogResult.data.agents.find(({ id }) => id === "build")
  if (buildAgent === undefined) return
  const snapshotPrompt = resolved.data.agentPrompt
  buildAgent.prompt = "Changed after admission."
  expect(resolved.data.agentPrompt).toBe(snapshotPrompt)
})

test("run execution snapshot captures validated selection tools in its manifest", async () => {
  const store = await createStore()
  const written = await configurationStoreWrite(store, configuration("selection-model"))
  expect(written.success).toBe(true)
  if (!written.success) return

  const resolved = runExecutionSnapshotResolve({ agentId: "agent-1", serverId: "server-1" }, store, {
    executionSelection: {
      tools: {
        primary: { agentId: "agent-1", tools: { bash: true, webfetch: true } },
        selectableSubagents: [{ agentId: "reviewer", tools: { bash: true } }],
      },
      version: 1,
    },
  })

  expect(resolved).toMatchObject({
    success: true,
    data: {
      configuration: { tools: { bash: true, webfetch: true } },
      executionManifest: {
        tools: {
          primary: { agentId: "agent-1", tools: ["bash", "webfetch", "skill", "delegate_task"] },
          selectableSubagents: [{ agentId: "reviewer", tools: ["bash", "skill", "delegate_task"] }],
        },
      },
    },
  })
})

test("run execution snapshot captures an immutable instruction manifest", async () => {
  const store = await createStore()
  const written = await configurationStoreWrite(store, configuration("instruction-model"))
  expect(written.success).toBe(true)
  if (!written.success) return

  const content = "Use the snapshotted project instructions."
  const instructionInput = {
    diagnostics: [],
    snapshots: [
      {
        canonicalPath: "/tmp/codeline-run-instructions/AGENTS.md",
        content,
        digest: `sha256-${crypto.createHash("sha256").update(content, "utf8").digest("hex")}`,
        precedence: 1,
        scope: ".",
        size: Buffer.byteLength(content, "utf8"),
        source: "project" as const,
      },
    ],
    version: 1 as const,
  }
  const resolved = runExecutionSnapshotResolve({ agentId: "agent-1", serverId: "server-1" }, store, {
    agentInstructions: instructionInput,
  })

  expect(resolved).toMatchObject({
    success: true,
    data: {
      executionManifest: { instructions: { snapshots: instructionInput.snapshots, version: 1 } },
    },
  })
  if (!resolved.success) return
  expect(Object.isFrozen(resolved.data.executionManifest?.instructions)).toBe(true)
  expect(Object.isFrozen(resolved.data.executionManifest?.instructions.snapshots[0])).toBe(true)

  instructionInput.snapshots[0]!.content = "Changed after run admission."
  expect(resolved.data.executionManifest?.instructions.snapshots[0]?.content).toBe(content)
})
