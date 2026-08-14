import { expect, test } from "bun:test"
import { agentConfigurationExecutionResolve } from "../src/agents/actions/agentConfigurationExecutionResolve.js"

const configuration = {
  apiKey: "$CLIPROXYAPI_API_KEY",
  baseUrl: "https://provider.test/v1",
  generation: { maxTokens: 512, temperature: 0.2 },
  model: "stored-model",
  provider: "cliproxyapi",
} as const

test("agent configuration execution resolver replaces only the model", () => {
  expect(
    agentConfigurationExecutionResolve(configuration, {
      model: "selected-model",
      provider: "cliproxyapi",
    }),
  ).toEqual({
    success: true,
    data: { ...configuration, model: "selected-model" },
  })
})

test("agent configuration execution resolver preserves omitted overrides and rejects provider changes", () => {
  expect(agentConfigurationExecutionResolve(configuration)).toEqual({ success: true, data: configuration })
  expect(
    agentConfigurationExecutionResolve(configuration, {
      model: "selected-model",
      provider: "codex-lb",
    }),
  ).toMatchObject({
    errorMessage: "The codeline execution override provider must match the agent provider.",
    success: false,
  })
})

test("agent configuration execution resolver rejects invalid override shapes", () => {
  expect(
    agentConfigurationExecutionResolve(configuration, {
      model: "selected-model",
      provider: "cliproxyapi",
      secret: "must-not-be-accepted",
    }),
  ).toMatchObject({
    errorMessage: "The codeline execution override is invalid.",
    success: false,
  })
})
