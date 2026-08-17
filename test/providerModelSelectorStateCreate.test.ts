import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { providerModelSelectorStateCreate } from "../src/providers/ui/providerModelSelectorStateCreate.js"

const revision = `sha256-${"a".repeat(64)}`
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const catalogModel = (
  providerId: string,
  id: string,
  options: { enabled?: boolean; efforts?: string[]; selectable?: boolean } = {},
) => ({
  capabilities: { input: ["text"], output: ["text"], tools: true },
  cost: [],
  enabled: options.enabled ?? true,
  id,
  limit: { context: 1000, output: 100 },
  name: `${providerId} ${id}`,
  providerId,
  reasoning: true,
  selectable: options.selectable ?? true,
  status: "active",
  variants: (options.efforts ?? ["medium"]).map((effort) => ({ effort, id: effort })),
})
const catalogProvider = (id: string, models: unknown[], enabled = true) => ({
  enabled,
  id,
  models,
  name: `Provider ${id}`,
})
const session = (provider: "cliproxyapi" | "codex-lb" | "deterministic", model: string) => ({
  agent: {
    configuration:
      provider === "deterministic"
        ? { model, provider }
        : {
            apiKey: provider === "codex-lb" ? "$CODEX_LB_API_TOKEN" : "$CLIPROXYAPI_API_KEY",
            baseUrl: "https://provider.test/v1",
            model,
            provider,
          },
  },
})

async function effectsSettle() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

test("catalog selection groups and sorts providers and models while excluding unsupported choices", async () => {
  const requests: Array<{ init?: RequestInit; url: string }> = []
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input, init) => {
        const url = String(input)
        requests.push({ init, url })
        if (url.includes("/sessions/")) return response(session("codex-lb", "shared"))
        return response({
          providers: [
            catalogProvider("codex-lb", [
              catalogModel("codex-lb", "zeta"),
              catalogModel("codex-lb", "shared", { efforts: ["high", "medium"] }),
              catalogModel("codex-lb", "disabled", { enabled: false, selectable: false }),
            ]),
            catalogProvider("unsupported", [catalogModel("unsupported", "hidden")]),
            catalogProvider("cliproxyapi", [catalogModel("cliproxyapi", "shared")]),
          ],
          revision,
        })
      },
      sessionId: () => "session/one",
    })
    void effectsSettle().then(() => {
      expect(state.status()).toBe("ready")
      expect(state.groups().map((group) => group.id)).toEqual(["cliproxyapi", "codex-lb"])
      expect(state.groups()[1]?.models.map((model) => model.id)).toEqual(["shared", "zeta"])
      expect(state.models().filter((model) => model.id === "shared")).toHaveLength(2)
      expect(state.selectedProvider()).toBe("codex-lb")
      expect(state.selectedModel()).toBe("shared")
      expect(state.effortOptions()).toEqual(["high", "medium"])
      expect(state.codelineExecution()).toBeNull()
      state.modelSelect("cliproxyapi", "shared")
      expect(state.codelineExecution()).toEqual({
        model: "shared",
        provider: "cliproxyapi",
        reasoningEffort: "medium",
      })
    })
    return rootDispose
  })
  await effectsSettle()
  expect(requests.map((request) => request.url)).toEqual(["/api/providers/catalog", "/api/sessions/session%2Fone"])
  expect(requests[0]?.init?.credentials).toBe("same-origin")
  dispose()
})

test("model changes preserve valid effort and choose a deterministic declared fallback", async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) =>
        String(input).includes("/sessions/")
          ? response(session("codex-lb", "alpha"))
          : response({
              providers: [
                catalogProvider("codex-lb", [
                  catalogModel("codex-lb", "alpha", { efforts: ["medium", "high"] }),
                  catalogModel("codex-lb", "beta", { efforts: ["low", "high"] }),
                  catalogModel("codex-lb", "gamma", { efforts: ["low"] }),
                ]),
              ],
              revision,
            }),
      sessionId: () => "session-1",
      storage,
    })
    void effectsSettle().then(() => {
      state.reasoningEffortSelect("high")
      state.modelSelect("codex-lb", "beta")
      expect(state.selectedReasoningEffort()).toBe("high")
      state.modelSelect("codex-lb", "gamma")
      expect(state.selectedReasoningEffort()).toBe("low")
      state.reasoningEffortSelect("xhigh")
      expect(state.selectedReasoningEffort()).toBe("low")
      expect(JSON.parse(values.get("codeline.provider-model-selection") ?? "null")).toEqual({
        selectedProvider: "codex-lb",
        selections: [{ model: "gamma", provider: "codex-lb", reasoningEffort: "low" }],
      })
    })
    return rootDispose
  })
  await effectsSettle()
  dispose()
})

test("legacy provider persistence migrates without losing exact provider and model identity", async () => {
  const values = new Map<string, string>([
    [
      "codeline.provider-model-selection",
      JSON.stringify({ selections: [{ model: "shared", provider: "codex-lb", reasoningEffort: "high" }] }),
    ],
  ])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) =>
        String(input).includes("/sessions/")
          ? response(session("codex-lb", "configured"))
          : response({
              providers: [
                catalogProvider("cliproxyapi", [catalogModel("cliproxyapi", "shared", { efforts: ["high"] })]),
                catalogProvider("codex-lb", [catalogModel("codex-lb", "shared", { efforts: ["high"] })]),
              ],
              revision,
            }),
      sessionId: () => "session-1",
      storage,
    })
    void effectsSettle().then(() => {
      expect(state.selectedProvider()).toBe("codex-lb")
      expect(state.selectedModel()).toBe("shared")
      expect(state.codelineExecution()).toEqual({
        model: "shared",
        provider: "codex-lb",
        reasoningEffort: "high",
      })
    })
    return rootDispose
  })
  await effectsSettle()
  dispose()
})

test("catalog fallback chooses the first sorted selectable model when configuration is unavailable", async () => {
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) =>
        String(input).includes("/sessions/")
          ? response(session("codex-lb", "missing"))
          : response({
              providers: [
                catalogProvider("codex-lb", [catalogModel("codex-lb", "zeta")]),
                catalogProvider("cliproxyapi", [catalogModel("cliproxyapi", "alpha")]),
              ],
              revision,
            }),
      sessionId: () => "session-1",
    })
    void effectsSettle().then(() => {
      expect(state.selectedProvider()).toBe("cliproxyapi")
      expect(state.selectedModel()).toBe("alpha")
      expect(state.codelineExecution()).toEqual({
        model: "alpha",
        provider: "cliproxyapi",
        reasoningEffort: "medium",
      })
    })
    return rootDispose
  })
  await effectsSettle()
  dispose()
})

test("catalog API failure uses legacy live discovery only when the catalog is unavailable", async () => {
  const requests: string[] = []
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) => {
        const url = String(input)
        requests.push(url)
        if (url.includes("/sessions/")) return response(session("deterministic", "configured"))
        if (url.endsWith("/catalog")) return response({ error: "unavailable" }, 500)
        if (url.endsWith("connection-test")) {
          return response({
            discoveredModelCount: 2,
            model: "configured",
            modelAvailable: true,
            ok: true,
            provider: "deterministic",
          })
        }
        return response({ models: [{ id: "configured" }, { id: "alternate", name: "Alternate" }] })
      },
      sessionId: () => "session-1",
    })
    void effectsSettle().then(() => {
      expect(state.status()).toBe("ready")
      expect(state.groups()[0]?.models.map((model) => model.id)).toEqual(["configured", "alternate"])
    })
    return rootDispose
  })
  await effectsSettle()
  expect(requests).toContain("/api/providers/models")
  expect(requests).toContain("/api/providers/connection-test")
  dispose()
})

test("selector reports an error when catalog and legacy discovery fail", async () => {
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) =>
        String(input).includes("/sessions/")
          ? response(session("deterministic", "configured"))
          : response({ error: "unavailable" }, 500),
      sessionId: () => "session-1",
    })
    void effectsSettle().then(() => expect(state.status()).toBe("error"))
    return rootDispose
  })
  await effectsSettle()
  dispose()
})
