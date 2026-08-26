import { expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { providerAgentCatalogRedact } from "../src/providers/catalog/providerAgentCatalogRedact.js"

const createCatalog = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codeline-catalog-"))
  for (const [file, source] of Object.entries(files)) {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, source)
  }
  return root
}

const model = (name: string, provider = "cliproxy"): string =>
  `provider: ${provider}\nproviderName: ${provider === "openai" ? "OpenAI" : "CLI Proxy"}\nbaseUrl: https://example.test/v1\napiKey: $EXAMPLE_API_KEY\nenv: [EXAMPLE_API_KEY]\ntransport: openai/completions\nname: ${name}\nlimit:\n  context: 128000\n  output: 4096\ncost:\n  input: 1\n  output: 2\n  cache:\n    read: 0.1\n    write: 0.2\ncapabilities:\n  tools: true\n  input: [text, image]\n  output: [text]\nvariants:\n  - id: high\n    effort: high\n    aisdk:\n      request:\n        reasoningEffort: high\n`

test("loads exact provider model IDs and agent prompts", async () => {
  const root = await createCatalog({
    "providers/cliproxy/gpt-4o.yml": model("GPT 4o"),
    "agents/reviewer.md":
      "---\nprovider: cliproxy\nmodel: gpt-4o\ndescription: Reviews changes\n---\n\nReview the diff carefully.\n",
  })
  const result = await providerAgentCatalogLoad(root)
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.providers[0]?.id).toBe("cliproxyapi")
  expect(result.data.providers[0]?.models[0]?.id).toBe("gpt-4o")
  expect(result.data.providers[0]?.name).toBe("CLI Proxy")
  expect(result.data.providers[0]?.models[0]?.connection.apiKey).toBe("$EXAMPLE_API_KEY")
  expect(result.data.providers[0]?.models[0]?.variants[0]?.effort).toBe("high")
  expect(result.data.agents[0]?.prompt).toBe("Review the diff carefully.")
  expect(result.data.revision).toMatch(/^sha256-[a-f0-9]{64}$/)
})

test("retains agent mode, permission rules, and model variants", async () => {
  const root = await createCatalog({
    "agents/reviewer.md":
      "---\nmode: subagent\nmodel: openai/gpt-4o\nvariant: high\npermission:\n  task:\n    '*': deny\n    explore: allow\n---\n\nReview the diff carefully.\n",
  })
  const result = await providerAgentCatalogLoad(root)
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.agents[0]).toMatchObject({
    mode: "subagent",
    model: "gpt-4o",
    provider: "openai",
    variant: "high",
    generation: { reasoningEffort: "high" },
    permission: { task: { "*": "deny", explore: "allow" } },
    tools: { bash: false, webfetch: false },
  })
})

test("parses explicit agent tool defaults and rejects unknown or invalid defaults", async () => {
  const enabled = await providerAgentCatalogLoad(
    await createCatalog({
      "agents/reviewer.md": "---\ntools:\n  bash: true\n  webfetch: true\n---\nReview the diff.",
    }),
  )
  expect(enabled.success).toBe(true)
  if (enabled.success) expect(enabled.data.agents[0]?.tools).toEqual({ bash: true, webfetch: true })

  for (const tools of ["bash: yes", "unknown: true"]) {
    const invalid = await providerAgentCatalogLoad(
      await createCatalog({ "agents/broken.md": `---\ntools:\n  ${tools}\n---\nPrompt` }),
    )
    expect(invalid.success).toBe(false)
  }
})

test("rejects invalid or unbounded agent permission metadata and modes", async () => {
  const invalidMode = await createCatalog({ "agents/broken.md": "---\nmode: all\n---\nPrompt" })
  expect((await providerAgentCatalogLoad(invalidMode)).success).toBe(false)

  const invalidPermission = await createCatalog({
    "agents/broken.md": "---\npermission:\n  task: maybe\n---\nPrompt",
  })
  expect((await providerAgentCatalogLoad(invalidPermission)).success).toBe(false)

  const tooDeep = `${"a:\n".repeat(9)}'*': allow`
  const unboundedPermission = await createCatalog({
    "agents/broken.md": `---\npermission:\n${tooDeep}\n---\nPrompt`,
  })
  expect((await providerAgentCatalogLoad(unboundedPermission)).success).toBe(false)
})

test("rejects provider connection conflicts and invalid literal credentials", async () => {
  const root = await createCatalog({
    "providers/openai/first.yml": model("First", "openai"),
    "providers/openai/second.yml": model("Second", "openai").replace("example.test", "other.test"),
  })
  const conflict = await providerAgentCatalogLoad(root)
  expect(conflict.success).toBe(false)

  const invalidRoot = await createCatalog({
    "providers/openai/model.yml": model("Model", "openai").replace("$EXAMPLE_API_KEY", "literal-secret"),
  })
  const invalid = await providerAgentCatalogLoad(invalidRoot)
  expect(invalid.success).toBe(false)
  expect(JSON.stringify(invalid)).not.toContain("literal-secret")
})

test("revision changes for references and execution-relevant metadata", async () => {
  const first = await createCatalog({
    "providers/openai/model.yml": model("Model", "openai"),
    "agents/one.md": "---\n---\nPrompt one",
  })
  const second = await createCatalog({
    "agents/one.md": "---\n---\nPrompt one",
    "providers/openai/model.yml": model("Model", "openai").replace("$EXAMPLE_API_KEY", "$OTHER_API_KEY"),
  })
  const firstCatalog = await providerAgentCatalogLoad(first)
  const secondCatalog = await providerAgentCatalogLoad(second)
  expect(firstCatalog.success && secondCatalog.success).toBe(true)
  if (!firstCatalog.success || !secondCatalog.success) return
  expect(firstCatalog.data.revision).not.toBe(secondCatalog.data.revision)
  const changed = await createCatalog({ "providers/openai/model.yml": model("Changed", "openai") })
  const changedCatalog = await providerAgentCatalogLoad(changed)
  expect(changedCatalog.success).toBe(true)
  if (!changedCatalog.success) return
  expect(changedCatalog.data.revision).not.toBe(firstCatalog.data.revision)
  const redacted = providerAgentCatalogRedact(firstCatalog.data)
  expect(JSON.stringify(redacted)).not.toContain("EXAMPLE_API_KEY")
  expect(JSON.stringify(redacted)).not.toContain("OTHER_API_KEY")
})

test("rejects invalid catalog layout and case-conflicting IDs", async () => {
  const invalidLayout = await createCatalog({
    "providers/readme.txt": "not a model",
  })
  expect((await providerAgentCatalogLoad(invalidLayout)).success).toBe(false)

  const collision = await createCatalog({
    "providers/openai/first.yml": model("First", "openai"),
    "providers/OpenAI/second.yml": model("Second", "openai"),
  })
  expect((await providerAgentCatalogLoad(collision)).success).toBe(false)

  const duplicate = await createCatalog({
    "providers/cliproxy/first.yml": model("First", "cliproxy"),
    "providers/cliproxyapi/second.yml": model("Second", "cliproxyapi"),
  })
  expect((await providerAgentCatalogLoad(duplicate)).success).toBe(false)

  const agentCollision = await createCatalog({
    "agents/one.md": "---\n---\nOne",
    "agents/One.md": "---\n---\nOne",
  })
  expect((await providerAgentCatalogLoad(agentCollision)).success).toBe(false)
})

test("accepts exact dotted model IDs and rejects unsafe or rewritten path IDs", async () => {
  const dotted = await createCatalog({
    "providers/openai/gpt-5.6-luna.yml": model("GPT 5.6 Luna", "openai").replace(
      "transport: openai/completions",
      "transport: openai/responses",
    ),
  })
  const dottedResult = await providerAgentCatalogLoad(dotted)
  expect(dottedResult.success).toBe(true)
  if (dottedResult.success) expect(dottedResult.data.providers[0]?.models[0]?.id).toBe("gpt-5.6-luna")

  for (const file of [
    "providers/openai/.hidden.yml",
    "providers/openai/model..yml",
    "providers/openai/Model.yml",
    "providers/openai/model name.yml",
    "providers/openai/model\\name.yml",
    "providers/openai/model\u0001.yml",
  ]) {
    const result = await providerAgentCatalogLoad(await createCatalog({ [file]: model("Model", "openai") }))
    expect(result.success).toBe(false)
  }

  const rewritten = await createCatalog({
    "providers/openai/gpt-5-6-luna.yml": `${model("GPT 5.6 Luna", "openai")}model: gpt-5.6-luna\n`,
  })
  expect((await providerAgentCatalogLoad(rewritten)).success).toBe(false)
})

test("requires model metadata to match the exact filename ID", async () => {
  const root = await createCatalog({
    "providers/openai/gpt-5.6-luna.yml": `${model("GPT 5.6 Luna", "openai")}model: gpt-5-6-luna\n`,
  })
  expect((await providerAgentCatalogLoad(root)).success).toBe(false)
})

test("rejects malformed frontmatter and inconsistent provider metadata", async () => {
  const malformed = await createCatalog({
    "agents/broken.md": "---\nenabled: true\n---",
  })
  expect((await providerAgentCatalogLoad(malformed)).success).toBe(false)

  const metadataConflict = await createCatalog({
    "providers/openai/first.yml": model("First", "openai"),
    "providers/openai/second.yml": model("Second", "openai").replace("providerName: OpenAI", "providerName: Other"),
  })
  expect((await providerAgentCatalogLoad(metadataConflict)).success).toBe(false)
})

test("keeps unsupported transports represented but disabled", async () => {
  for (const transport of ["aisdk", "anthropic/messages", "vendor/custom"]) {
    const root = await createCatalog({
      "providers/openai/model.yml": model("Model", "openai").replace("openai/completions", transport),
    })
    const result = await providerAgentCatalogLoad(root)
    expect(result.success).toBe(true)
    if (!result.success) continue
    const catalogModel = result.data.providers[0]?.models[0]
    expect(catalogModel?.connection.transport).toBe(transport)
    expect(catalogModel?.enabled).toBe(false)
    expect(providerAgentCatalogRedact(result.data).providers[0]?.models[0]?.selectable).toBe(false)
  }
})

test("accepts only environment references in explicit option credentials", async () => {
  const valid = await createCatalog({
    "providers/openai/model.yml": `${model("Model", "openai")}options:\n  apiKey: OPTION_API_KEY\n`,
  })
  const validResult = await providerAgentCatalogLoad(valid)
  expect(validResult.success).toBe(true)

  const invalid = await createCatalog({
    "providers/openai/model.yml": `${model("Model", "openai")}options:\n  apiKey: literal-secret\n`,
  })
  const invalidResult = await providerAgentCatalogLoad(invalid)
  expect(invalidResult.success).toBe(false)
  expect(JSON.stringify(invalidResult)).not.toContain("literal-secret")
})

test("does not expose connection or provider option payloads in redaction", async () => {
  const root = await createCatalog({
    "providers/openai/model.yml": `${model("Model", "openai")}providerOptions:\n  headers:\n    X-Internal: do-not-expose\noptions:\n  body:\n    internal: do-not-expose\n`,
  })
  const result = await providerAgentCatalogLoad(root)
  expect(result.success).toBe(true)
  if (!result.success) return
  const redacted = providerAgentCatalogRedact(result.data)
  expect(JSON.stringify(redacted)).not.toContain("do-not-expose")
  expect(redacted).not.toHaveProperty("agents")
  expect(redacted.providers[0]).not.toHaveProperty("connection")
  expect(redacted.providers[0]?.models[0]).not.toHaveProperty("connection")
  expect(redacted.providers[0]?.models[0]).not.toHaveProperty("options")
  expect(redacted.providers[0]?.models[0]?.variants[0]).not.toHaveProperty("options")
})

test("loads the root catalog with two primary agents and all remaining subagents", async () => {
  const result = await providerAgentCatalogLoad(process.cwd())
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.agents).toHaveLength(11)
  expect(result.data.agents.filter((agent) => agent.mode === "primary")).toHaveLength(2)
  expect(result.data.agents.filter((agent) => agent.mode === "subagent")).toHaveLength(9)

  const providers = result.data.providers
  expect(providers).toHaveLength(2)
  const cliproxy = providers.find((p) => p.id === "cliproxyapi")
  const codexLb = providers.find((p) => p.id === "codex-lb")
  expect(cliproxy).toBeDefined()
  expect(codexLb).toBeDefined()
  expect(cliproxy?.models).toHaveLength(10)
  expect(codexLb?.models).toHaveLength(3)

  // Blacklisted models in cliproxyapi are disabled
  const blacklisted = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]
  for (const modelId of blacklisted) {
    const m = cliproxy?.models.find((model) => model.id === modelId)
    expect(m?.enabled).toBe(false)
  }

  // Active models in cliproxyapi are enabled
  const activeCliproxy = [
    "claude-fable-5",
    "claude-opus-4-6-thinking",
    "claude-opus-4-8",
    "claude-opus-5",
    "gemini-3.7-flash-high",
    "grok-4.5",
    "grok-4.6",
  ]
  for (const modelId of activeCliproxy) {
    const m = cliproxy?.models.find((model) => model.id === modelId)
    expect(m?.enabled).toBe(true)
  }

  // All codex-lb models are enabled
  for (const m of codexLb?.models ?? []) {
    expect(m.enabled).toBe(true)
  }
})
