import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { providerModelSelectorStateCreate } from "../src/providers/ui/providerModelSelectorStateCreate.js"

const response = (body: unknown) => new Response(JSON.stringify(body))

async function effectsSettle() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

test("selector loads selected-session configuration and discovered models", async () => {
  const requests: string[] = []
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) => {
        const url = String(input)
        requests.push(url)
        if (url.includes("/sessions/")) {
          return response({ agent: { configuration: { model: "configured", provider: "deterministic" } } })
        }
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
      sessionId: () => "session/one",
    })
    void effectsSettle().then(() => {
      expect(state.status()).toBe("ready")
      expect(state.provider()).toBe("deterministic")
      expect(state.selectedModel()).toBe("configured")
      expect(state.codelineExecution()).toBeNull()
      expect(state.models()).toHaveLength(2)
    })
    return rootDispose
  })
  await effectsSettle()
  expect(requests).toContain("/api/sessions/session%2Fone")
  dispose()
})

test("selector persists a validated provider preference and restores it", async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("/sessions/")) {
      return response({ agent: { configuration: { model: "configured", provider: "deterministic" } } })
    }
    if (url.endsWith("connection-test")) {
      return response({
        discoveredModelCount: 2,
        model: "configured",
        modelAvailable: true,
        ok: true,
        provider: "deterministic",
      })
    }
    return response({ models: [{ id: "configured" }, { id: "alternate" }] })
  }

  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({ fetch, sessionId: () => "session-1", storage })
    void effectsSettle().then(() => {
      state.modelSelect("alternate")
      expect(state.selectedModel()).toBe("alternate")
      expect(state.codelineExecution()).toEqual({ model: "alternate", provider: "deterministic" })
      expect(JSON.parse(values.get("codeline.provider-model-selection") ?? "null")).toEqual({
        selections: [{ model: "alternate", provider: "deterministic" }],
      })
    })
    return rootDispose
  })
  await effectsSettle()
  await Promise.resolve()
  dispose()
})

test("selector restores and persists the last reasoning effort", async () => {
  const values = new Map<string, string>([
    [
      "codeline.provider-model-selection",
      JSON.stringify({ selections: [{ model: "alternate", provider: "deterministic", reasoningEffort: "high" }] }),
    ],
  ])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) => {
        const url = String(input)
        if (url.includes("/sessions/")) {
          return response({ agent: { configuration: { model: "configured", provider: "deterministic" } } })
        }
        if (url.endsWith("connection-test")) {
          return response({
            discoveredModelCount: 2,
            model: "configured",
            modelAvailable: true,
            ok: true,
            provider: "deterministic",
          })
        }
        return response({ models: [{ id: "configured" }, { id: "alternate" }] })
      },
      sessionId: () => "session-1",
      storage,
    })
    void effectsSettle().then(() => {
      expect(state.selectedModel()).toBe("alternate")
      expect(state.selectedReasoningEffort()).toBe("high")
      expect(state.codelineExecution()).toEqual({
        model: "alternate",
        provider: "deterministic",
        reasoningEffort: "high",
      })
      state.reasoningEffortSelect("xhigh")
      expect(JSON.parse(values.get("codeline.provider-model-selection") ?? "null")).toEqual({
        selections: [{ model: "alternate", provider: "deterministic", reasoningEffort: "xhigh" }],
      })
    })
    return rootDispose
  })
  await effectsSettle()
  await Promise.resolve()
  dispose()
})

test("selector rejects discovery data for a different provider", async () => {
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) => {
        const url = String(input)
        if (url.includes("/sessions/")) {
          return response({ agent: { configuration: { model: "configured", provider: "deterministic" } } })
        }
        if (url.endsWith("connection-test")) {
          return response({
            discoveredModelCount: 1,
            model: "remote",
            modelAvailable: true,
            ok: true,
            provider: "codex-lb",
          })
        }
        return response({ models: [{ id: "remote" }] })
      },
      sessionId: () => "session-1",
    })
    void effectsSettle().then(() => expect(state.status()).toBe("error"))
    return rootDispose
  })
  await effectsSettle()
  dispose()
})

test("selector rejects discovery data for a different configured model", async () => {
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      fetch: async (input) => {
        const url = String(input)
        if (url.includes("/sessions/")) {
          return response({ agent: { configuration: { model: "session-model", provider: "deterministic" } } })
        }
        if (url.endsWith("connection-test")) {
          return response({
            discoveredModelCount: 1,
            model: "runtime-model",
            modelAvailable: true,
            ok: true,
            provider: "deterministic",
          })
        }
        return response({ models: [{ id: "runtime-model" }] })
      },
      sessionId: () => "session-1",
    })
    void effectsSettle().then(() => expect(state.status()).toBe("error"))
    return rootDispose
  })
  await effectsSettle()
  dispose()
})
