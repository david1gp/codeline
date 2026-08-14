import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import type { CodelineConfigurationDocument } from "../src/configuration/codelineConfigurationDocumentSchema.js"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { configurationStoreRead } from "../src/configuration/configurationStoreRead.js"
import { configurationStoreWrite } from "../src/configuration/configurationStoreWrite.js"
import { runExecutionSnapshotResolve } from "../src/run/actions/runExecutionSnapshotResolve.js"

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
      },
      configurationRevision: written.data,
      target: { agentId: "agent-1", serverId: "server-1" },
    },
  })
  if (!resolved.success) return
  expect(Object.isFrozen(resolved.data)).toBe(true)
  expect(Object.isFrozen(resolved.data.configuration)).toBe(true)
  expect(Object.isFrozen(resolved.data.target)).toBe(true)
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
    errorMessage: "The run execution target is not configured.",
    success: false,
  })
})
