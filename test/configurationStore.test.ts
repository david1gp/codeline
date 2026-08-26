import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { gitStoreHistory, gitStoreRun } from "@adaptive-ds/git-store"
import * as v from "valibot"
import type { CodelineConfigurationDocument } from "../src/configuration/codelineConfigurationDocumentSchema.js"
import { codelineConfigurationDocumentSchema } from "../src/configuration/codelineConfigurationDocumentSchema.js"
import { configurationStoreCreate } from "../src/configuration/configurationStoreCreate.js"
import { configurationStoreRead } from "../src/configuration/configurationStoreRead.js"
import { configurationStoreReload } from "../src/configuration/configurationStoreReload.js"
import { configurationStoreWrite } from "../src/configuration/configurationStoreWrite.js"

const tmpRoot = Bun.env.TMPDIR ?? "/tmp"
const directories: string[] = []

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpRoot, "codeline-configuration-"))
  directories.push(directory)
  return directory
}

function validConfiguration(model = "deterministic-test"): CodelineConfigurationDocument {
  return {
    agentConfigurations: [
      {
        configuration: { model, provider: "deterministic", tools: { bash: false, webfetch: false } },
        target: { agentId: "agent-1", serverId: "server-1" },
      },
    ],
    version: 1,
  }
}

async function createStore() {
  const result = await configurationStoreCreate({
    authorEmail: "configuration-test@example.com",
    authorName: "Codeline Configuration Test",
    branch: "main",
    dir: tempDirectory(),
  })
  if (!result.success) throw new Error(result.errorMessage)
  return result.data
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory !== undefined) rmSync(directory, { force: true, recursive: true })
  }
})

describe("configurationStore", () => {
  test("writes a valid document as a local conventional commit without a remote", async () => {
    const store = await createStore()
    const written = await configurationStoreWrite(store, validConfiguration())

    expect(written.success).toBe(true)
    if (!written.success) return
    expect(written.data).toMatch(/^[0-9a-f]{40}$/)
    expect(store.gitStore.autoPush).toBe(false)

    const history = await gitStoreHistory(store.gitStore)
    expect(history.success).toBe(true)
    if (history.success) expect(history.data[0]?.message).toBe("chore(configuration): update configuration")

    const remote = await gitStoreRun(store.gitStore, ["remote"])
    expect(remote.success).toBe(true)
    if (remote.success) expect(remote.data).toBe("")
  })

  test("rejects duplicate targets and literal secrets before writing", async () => {
    const store = await createStore()
    const duplicate = validConfiguration()
    duplicate.agentConfigurations.push({
      configuration: { model: "other", provider: "deterministic", tools: { bash: false, webfetch: false } },
      target: { agentId: "agent-1", serverId: "server-1" },
    })
    expect(v.safeParse(codelineConfigurationDocumentSchema, duplicate).success).toBe(false)
    const duplicateWrite = await configurationStoreWrite(store, duplicate)
    expect(duplicateWrite.success).toBe(false)
    if (!duplicateWrite.success) expect(duplicateWrite.errorData).toBeUndefined()
    const secretWrite = await configurationStoreWrite(store, {
      agentConfigurations: [
        {
          configuration: {
            apiKey: "literal-secret",
            baseUrl: "https://provider.test/v1",
            model: "gpt-test",
            provider: "cliproxyapi",
          },
          target: { agentId: "agent-1", serverId: "server-1" },
        },
      ],
      version: 1,
    })
    expect(secretWrite.success).toBe(false)
    if (!secretWrite.success) expect(secretWrite.errorData).toBeUndefined()
    expect(await Bun.file(join(store.gitStore.dir, "configuration.json")).exists()).toBe(false)
  })

  test("changes revisions and reads the complete last-good snapshot", async () => {
    const store = await createStore()
    const first = await configurationStoreWrite(store, validConfiguration("first"))
    const second = await configurationStoreWrite(store, validConfiguration("second"))

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    if (!first.success || !second.success) return
    expect(second.data).not.toBe(first.data)

    const read = configurationStoreRead(store)
    expect(read.success).toBe(true)
    if (read.success) {
      expect(read.data.configuration).toEqual(validConfiguration("second"))
      expect(read.data.revision).toBe(second.data)
    }
  })

  test("ignores valid working-tree edits during reload and startup", async () => {
    const store = await createStore()
    const written = await configurationStoreWrite(store, validConfiguration())
    expect(written.success).toBe(true)
    if (!written.success) return

    await Bun.write(join(store.gitStore.dir, "configuration.json"), JSON.stringify(validConfiguration("manual-edit")))
    const reloaded = await configurationStoreReload(store)
    expect(reloaded.success).toBe(true)
    if (reloaded.success) expect(reloaded.data.configuration).toEqual(validConfiguration())

    const restarted = await configurationStoreCreate({
      authorEmail: "configuration-test@example.com",
      authorName: "Codeline Configuration Test",
      branch: "main",
      dir: store.gitStore.dir,
    })
    expect(restarted.success).toBe(true)
    if (restarted.success) {
      const read = configurationStoreRead(restarted.data)
      expect(read.success).toBe(true)
      if (read.success) expect(read.data.configuration).toEqual(validConfiguration())
    }
  })

  test("masks invalid committed content without returning document data", async () => {
    const store = await createStore()
    const written = await configurationStoreWrite(store, validConfiguration())
    expect(written.success).toBe(true)
    if (!written.success) return

    await Bun.write(
      join(store.gitStore.dir, "configuration.json"),
      JSON.stringify({
        agentConfigurations: [
          {
            configuration: {
              apiKey: "literal-secret",
              baseUrl: "https://provider.test/v1",
              model: "gpt-test",
              provider: "cliproxyapi",
            },
            target: { agentId: "agent-1", serverId: "server-1" },
          },
        ],
        version: 1,
      }),
    )
    expect((await gitStoreRun(store.gitStore, ["add", "--", "configuration.json"])).success).toBe(true)
    expect((await gitStoreRun(store.gitStore, ["commit", "-m", "test: commit invalid configuration"])).success).toBe(
      true,
    )

    const reloaded = await configurationStoreReload(store)
    expect(reloaded.success).toBe(false)
    if (!reloaded.success) expect(reloaded.errorData).toBeUndefined()

    const read = configurationStoreRead(store)
    expect(read.success).toBe(true)
    if (read.success) {
      expect(read.data.configuration).toEqual(validConfiguration())
      expect(read.data.revision).toBe(written.data)
    }
  })

  test("returns defensive snapshot clones", async () => {
    const store = await createStore()
    const written = await configurationStoreWrite(store, validConfiguration())
    expect(written.success).toBe(true)
    if (!written.success) return

    const firstRead = configurationStoreRead(store)
    expect(firstRead.success).toBe(true)
    if (!firstRead.success) return

    const mutableConfiguration = firstRead.data.configuration as CodelineConfigurationDocument
    mutableConfiguration.agentConfigurations[0]!.configuration.model = "caller-mutation"

    const read = configurationStoreRead(store)
    expect(read.success).toBe(true)
    if (read.success) {
      expect(read.data.configuration).toEqual(validConfiguration())
      expect(read.data.revision).toBe(written.data)
    }
  })

  test("rolls back a failed commit and preserves the last-good snapshot", async () => {
    const store = await createStore()
    const first = await configurationStoreWrite(store, validConfiguration("first"))
    expect(first.success).toBe(true)
    if (!first.success) return

    const hook = join(store.gitStore.dir, ".git", "hooks", "pre-commit")
    await Bun.write(hook, "#!/bin/sh\nexit 1\n")
    chmodSync(hook, 0o755)

    const failed = await configurationStoreWrite(store, validConfiguration("failed"))
    expect(failed.success).toBe(false)
    expect(await Bun.file(join(store.gitStore.dir, "configuration.json")).json()).toEqual(validConfiguration("first"))

    const status = await gitStoreRun(store.gitStore, ["status", "--porcelain"])
    expect(status.success).toBe(true)
    if (status.success) expect(status.data).toBe("")

    const read = configurationStoreRead(store)
    expect(read.success).toBe(true)
    if (read.success) expect(read.data.configuration).toEqual(validConfiguration("first"))
  })

  test("removes the first uncommitted file when an unborn commit fails", async () => {
    const store = await createStore()
    const hook = join(store.gitStore.dir, ".git", "hooks", "pre-commit")
    await Bun.write(hook, "#!/bin/sh\nexit 1\n")
    chmodSync(hook, 0o755)

    const failed = await configurationStoreWrite(store, validConfiguration())
    expect(failed.success).toBe(false)
    expect(await Bun.file(join(store.gitStore.dir, "configuration.json")).exists()).toBe(false)

    const status = await gitStoreRun(store.gitStore, ["status", "--porcelain"])
    expect(status.success).toBe(true)
    if (status.success) expect(status.data).toBe("")
  })

  test("keeps autoPush disabled even when callers try to mutate the store", async () => {
    const store = await createStore()

    expect(Object.isFrozen(store.gitStore)).toBe(true)
    expect(Reflect.set(store.gitStore, "autoPush", true)).toBe(false)
    expect(store.gitStore.autoPush).toBe(false)

    const written = await configurationStoreWrite(store, validConfiguration())
    expect(written.success).toBe(true)
    const remote = await gitStoreRun(store.gitStore, ["remote"])
    expect(remote.success).toBe(true)
    if (remote.success) expect(remote.data).toBe("")
  })
})
