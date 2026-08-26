import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { gitStoreHistory } from "@adaptive-ds/git-store"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { configurationStoreRead } from "../src/configuration/configurationStoreRead.js"
import { configurationStoreWrite } from "../src/configuration/configurationStoreWrite.js"
import { exampleDataConfigurationReconcile } from "../src/database/exampleDataConfigurationReconcile.js"
import { exampleDataFixture } from "../src/database/exampleDataFixture.js"
import { providerAgentCatalogConfigurationCompile } from "../src/providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"

const directories: string[] = []
const catalogResult = await providerAgentCatalogLoad(new URL("../", import.meta.url).pathname)
if (!catalogResult.success) throw new Error(catalogResult.errorMessage)
const catalogConfigurations = providerAgentCatalogConfigurationCompile(catalogResult.data)
if (!catalogConfigurations.success) throw new Error(catalogConfigurations.errorMessage)

function tempDirectory(): string {
  const directory = mkdtempSync(join(Bun.env.TMPDIR ?? "/tmp", "codeline-example-configuration-"))
  directories.push(directory)
  return directory
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory !== undefined) rmSync(directory, { force: true, recursive: true })
  }
})

test("reconciles all fixture agents while preserving unrelated configuration idempotently", async () => {
  const storeResult = await configurationStoreCreate({
    authorEmail: "example-configuration@example.test",
    authorName: "Codeline Example Configuration Test",
    branch: "main",
    dir: tempDirectory(),
  })
  expect(storeResult.success).toBe(true)
  if (!storeResult.success) return

  const fixtureAgent = exampleDataFixture.agents[0]
  if (fixtureAgent === undefined) throw new Error("The example fixture must contain an agent.")
  const initial = await configurationStoreWrite(storeResult.data, {
    agentConfigurations: [
      {
        configuration: { model: "user-managed-model", provider: "deterministic" },
        target: { agentId: "user-managed-agent", serverId: "user-managed-server" },
      },
      {
        configuration: { model: "stale-model", provider: "deterministic" },
        target: { agentId: fixtureAgent.id, serverId: fixtureAgent.serverId },
      },
      {
        configuration: {
          apiKey: "$CODEX_LB_API_TOKEN",
          baseUrl: "https://codex.provider.test/v1",
          model: "gpt-5.6-luna",
          provider: "codex-lb",
        },
        target: { agentId: "example-agent-codex-lb-luna", serverId: "example-server-local" },
      },
      {
        configuration: {
          apiKey: "$CLIPROXYAPI_API_KEY",
          baseUrl: "https://cliproxy.provider.test/v1",
          model: "gpt-5.6-luna",
          provider: "cliproxyapi",
        },
        target: { agentId: "example-agent-cliproxyapi-luna", serverId: "example-server-local" },
      },
    ],
    version: 1,
  })
  expect(initial.success).toBe(true)

  const reconciled = await exampleDataConfigurationReconcile(storeResult.data)
  expect(reconciled).toEqual({ success: true, data: { changed: true } })

  const read = configurationStoreRead(storeResult.data)
  expect(read.success).toBe(true)
  if (!read.success) return
  expect(read.data.configuration.agentConfigurations[0]).toEqual({
    configuration: { model: "user-managed-model", provider: "deterministic", tools: { bash: false, webfetch: false } },
    target: { agentId: "user-managed-agent", serverId: "user-managed-server" },
  })
  expect(read.data.configuration.agentConfigurations.slice(1)).toEqual([
    ...exampleDataFixture.agents.map((agent) => ({
      configuration: { ...agent.configuration, tools: { bash: false, webfetch: false } },
      target: { agentId: agent.id, serverId: agent.serverId },
    })),
    ...catalogConfigurations.data.map(({ agent, configuration }) => ({
      configuration,
      target: { agentId: agent.id, serverId: "example-server-local" },
    })),
  ])
  expect(
    read.data.configuration.agentConfigurations.find(({ target }) => target.agentId === "luna-high")?.configuration,
  ).toMatchObject({ model: "gpt-5.6-luna", provider: "codex-lb" })
  expect(
    read.data.configuration.agentConfigurations.some(
      ({ target }) =>
        target.agentId === "example-agent-codex-lb-luna" || target.agentId === "example-agent-cliproxyapi-luna",
    ),
  ).toBe(false)

  const historyBefore = await gitStoreHistory(storeResult.data.gitStore)
  const repeated = await exampleDataConfigurationReconcile(storeResult.data)
  const historyAfter = await gitStoreHistory(storeResult.data.gitStore)
  expect(repeated).toEqual({ success: true, data: { changed: false } })
  expect(historyAfter).toEqual(historyBefore)
})
