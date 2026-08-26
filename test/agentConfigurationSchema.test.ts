import { expect, test } from "bun:test"
import * as v from "valibot"
import { agentConfigurationSchema } from "../src/agents/schema/agentConfigurationSchema.js"
import { cliProxyApiSettingsParse } from "../src/providers/runtime/cliProxyApiSettingsParse.js"
import { secretReferenceResolve } from "../src/providers/runtime/secretReferenceResolve.js"
import { toolNameSchema } from "../src/tools/schema/toolNameSchema.js"

test("agent configuration accepts strict deterministic and CLIProxyAPI variants", () => {
  const deterministic = v.safeParse(agentConfigurationSchema, {
    provider: "deterministic",
    model: "deterministic-test",
    generation: { maxTokens: 128, temperature: 0 },
  })
  expect(deterministic.success).toBe(true)
  if (deterministic.success) expect(deterministic.output.tools).toEqual({ bash: false, webfetch: false })
  expect(
    v.safeParse(agentConfigurationSchema, {
      apiKey: "$CLIPROXYAPI_API_KEY",
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "gpt-test",
      provider: "cliproxyapi",
      generation: { maxTokens: 256, temperature: 0.2 },
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(agentConfigurationSchema, {
      apiKey: "$SUBS_CONTENTOREN_DE_API_KEY",
      baseUrl: "https://subs.contentoren.de/v1",
      model: "gpt-test",
      provider: "cliproxyapi",
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(agentConfigurationSchema, {
      apiKey: "$CODEX_LB_API_TOKEN",
      baseUrl: "https://codex.provider.test/v1",
      model: "gpt-test",
      provider: "codex-lb",
    }).success,
  ).toBe(true)
})

test("tool names and agent tool defaults are strict", () => {
  for (const name of ["bash", "webfetch", "skill", "delegate_task"]) {
    expect(v.safeParse(toolNameSchema, name).success).toBe(true)
  }
  for (const name of ["glob", "grep", "websearch", "edit", "write"]) {
    expect(v.safeParse(toolNameSchema, name).success).toBe(false)
  }

  const explicit = v.safeParse(agentConfigurationSchema, {
    provider: "deterministic",
    model: "deterministic-test",
    tools: { bash: true, webfetch: true },
  })
  expect(explicit.success).toBe(true)
  if (explicit.success) expect(explicit.output.tools).toEqual({ bash: true, webfetch: true })
  expect(
    v.safeParse(agentConfigurationSchema, {
      provider: "deterministic",
      model: "deterministic-test",
      tools: { bash: true, unknown: false },
    }).success,
  ).toBe(false)
  expect(
    v.safeParse(agentConfigurationSchema, {
      provider: "deterministic",
      model: "deterministic-test",
      tools: { bash: "yes" },
    }).success,
  ).toBe(false)
})

test("agent configuration rejects literal credentials, unknown providers, bad URLs, and limits", () => {
  for (const input of [
    { provider: "cliproxyapi", model: "gpt-test", baseUrl: "https://provider.test/v1", apiKey: "literal-secret" },
    { provider: "cliproxyapi", model: "gpt-test", baseUrl: "https://provider.test/v1", apiKey: "$CODEX_LB_API_TOKEN" },
    { provider: "codex-lb", model: "gpt-test", baseUrl: "https://provider.test/v1", apiKey: "$CLIPROXYAPI_API_KEY" },
    { provider: "unknown", model: "gpt-test" },
    { provider: "cliproxyapi", model: "gpt-test", baseUrl: "ftp://provider.test/v1", apiKey: "$CLIPROXYAPI_API_KEY" },
    {
      provider: "cliproxyapi",
      model: "gpt-test",
      baseUrl: "https://user:literal-secret@provider.test/v1",
      apiKey: "$CLIPROXYAPI_API_KEY",
    },
    {
      provider: "cliproxyapi",
      model: "gpt-test",
      baseUrl: "https://provider.test/v1?apiKey=literal-secret",
      apiKey: "$CLIPROXYAPI_API_KEY",
    },
    { provider: "deterministic", model: "gpt-test", generation: { maxTokens: 0 } },
    { provider: "deterministic", model: "gpt-test", generation: { temperature: 3 } },
  ]) {
    expect(v.safeParse(agentConfigurationSchema, input).success).toBe(false)
  }
})

test("CLIProxyAPI settings parse only validated runtime values", () => {
  const result = cliProxyApiSettingsParse({
    apiKey: "$CLIPROXYAPI_API_KEY",
    baseUrl: "https://provider.test/v1",
    maxTokens: 1024,
    model: "gpt-test",
    temperature: 0.3,
  })

  expect(result.success).toBe(true)
  expect(
    cliProxyApiSettingsParse({ apiKey: "secret", baseUrl: "not-a-url", maxTokens: -1, model: "", temperature: 4 })
      .success,
  ).toBe(false)
  expect(
    cliProxyApiSettingsParse({
      apiKey: "$CODEX_LB_API_TOKEN",
      baseUrl: "https://provider.test/v1",
      maxTokens: 1024,
      model: "gpt-test",
      temperature: 0.3,
    }).success,
  ).toBe(false)
  expect(
    cliProxyApiSettingsParse({
      apiKey: "$CLIPROXYAPI_API_KEY",
      baseUrl: "https://user:literal-secret@provider.test/v1",
      maxTokens: 1024,
      model: "gpt-test",
      temperature: 0.3,
    }).success,
  ).toBe(false)
})

test("secret resolution is allowlisted and does not expose values in failures", () => {
  const secret = "test-secret-value"
  const resolved = secretReferenceResolve("$CLIPROXYAPI_API_KEY", { CLIPROXYAPI_API_KEY: secret })
  expect(resolved.success).toBe(true)
  if (resolved.success) {
    expect(resolved.data.value).toBe(secret)
    expect(JSON.stringify(resolved)).not.toContain(secret)
  }

  const catalogSecret = secretReferenceResolve("$SUBS_CONTENTOREN_DE_API_KEY", {
    SUBS_CONTENTOREN_DE_API_KEY: secret,
  })
  expect(catalogSecret.success).toBe(true)
  if (catalogSecret.success) expect(JSON.stringify(catalogSecret)).not.toContain(secret)

  const disallowed = secretReferenceResolve("$DATABASE_URL", { DATABASE_URL: secret })
  expect(disallowed.success).toBe(false)
  if (!disallowed.success) expect(JSON.stringify(disallowed)).not.toContain(secret)

  const missing = secretReferenceResolve("$CLIPROXYAPI_API_KEY", {})
  expect(missing.success).toBe(false)
  if (!missing.success) expect(JSON.stringify(missing)).not.toContain(secret)

  const inherited = secretReferenceResolve(
    "$CLIPROXYAPI_API_KEY",
    Object.create({ CLIPROXYAPI_API_KEY: secret }) as Readonly<Record<string, string | undefined>>,
  )
  expect(inherited.success).toBe(false)
  if (!inherited.success) expect(JSON.stringify(inherited)).not.toContain(secret)

  const malformedEnvironment = secretReferenceResolve("$CLIPROXYAPI_API_KEY", {
    CLIPROXYAPI_API_KEY: 42 as never,
  })
  expect(malformedEnvironment.success).toBe(false)
})
