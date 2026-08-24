import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { providerModelSelectorStateCreate } = await import("../src/providers/ui/providerModelSelectorStateCreate.js")
const { httpQueryCacheCreate } = await import("../src/ui/httpQueryCacheCreate.js")

const catalogRevision = 1
const etag = (value: string) => `"${value}"`
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ETag: etag("catalog-1"), ...headers },
    status,
  })
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
const sessionDetail = (sessionId: string) => ({
  agent: { id: "agent-1" },
  etag: etag("session-1"),
  revision: 3,
  schemaVersion: "session-v1",
  server: { id: "server-1" },
  session: {
    archivedAt: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    id: sessionId,
    metadata: {},
    parentSessionId: null,
    pinned: false,
    primaryAgentId: "agent-1",
    projectPath: "~",
    revision: 3,
    serverId: "server-1",
    title: "Session",
    updatedAt: "2026-08-22T00:00:00.000Z",
  },
})
const agentDetail = (provider: "cliproxyapi" | "codex-lb" | "deterministic", model: string, revision = 2) => ({
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
    id: "agent-1",
    name: "Agent",
    role: "primary",
    serverId: "server-1",
  },
  etag: etag(`agent-${revision}`),
  revision,
  schemaVersion: "agent-v2",
})

let accountSequence = 0
const accountIdCreate = () => {
  accountSequence += 1
  const id = `account-${accountSequence}`
  httpQueryCacheCreate(id).clear()
  return () => id
}

async function effectsSettle() {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const routedFetch =
  (handlers: { agent?: () => Response; catalog: () => Response; session?: () => Response }) =>
  async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/api/providers/catalog")) return handlers.catalog()
    if (url.includes("/agents/")) return handlers.agent?.() ?? response({ error: "unavailable" }, 500)
    if (url.includes("/api/sessions/")) return handlers.session?.() ?? response(sessionDetail("session-1"))
    return response({ error: "x" }, 500)
  }

test("catalog selection groups and sorts providers and models while excluding unsupported choices", async () => {
  const requests: string[] = []
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        requests.push(String(input))
        return routedFetch({
          agent: () => response(agentDetail("codex-lb", "shared")),
          catalog: () =>
            response({
              providers: [
                catalogProvider("codex-lb", [
                  catalogModel("codex-lb", "zeta"),
                  catalogModel("codex-lb", "shared", { efforts: ["high", "medium"] }),
                  catalogModel("codex-lb", "disabled", { enabled: false, selectable: false }),
                ]),
                catalogProvider("unsupported", [catalogModel("unsupported", "hidden")]),
                catalogProvider("cliproxyapi", [catalogModel("cliproxyapi", "shared")]),
              ],
              revision: catalogRevision,
            }),
        })(input, init)
      },
      isOnline: () => true,
      sessionId: () => "session/one",
    })
    void effectsSettle().then(() => {
      expect(state.status()).toBe("ready")
      expect(state.dataStatus()).toBe("ready")
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
  expect(requests.some((url) => url.includes("/api/providers/catalog"))).toBe(true)
  expect(requests.some((url) => url.includes("/api/sessions/session%2Fone"))).toBe(true)
  expect(requests.some((url) => url.includes("/api/servers/server-1/agents/agent-1"))).toBe(true)
  dispose()
})

test("a conditional catalog revalidation retains the cached representation on 304", async () => {
  const accountId = accountIdCreate()
  let conditionalHeader: string | null = null
  let catalogRequests = 0
  const catalogBody = {
    providers: [catalogProvider("codex-lb", [catalogModel("codex-lb", "shared")])],
    revision: catalogRevision,
  }
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes("/api/providers/catalog")) {
      catalogRequests += 1
      const ifNoneMatch = new Headers(init?.headers).get("If-None-Match")
      if (catalogRequests > 1) {
        conditionalHeader = ifNoneMatch
        return new Response(null, { headers: { ETag: etag("catalog-1") }, status: 304 })
      }
      return response(catalogBody, 200, { ETag: etag("catalog-1") })
    }
    if (url.includes("/agents/")) return response(agentDetail("codex-lb", "shared"))
    return response(sessionDetail("session-1"))
  }

  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      accountId,
      fetch: fetcher,
      isOnline: () => true,
      sessionId: () => "session-1",
    })
    void effectsSettle().then(async () => {
      expect(state.status()).toBe("ready")
      state.refresh()
      await effectsSettle()
      expect(conditionalHeader).toBe(etag("catalog-1"))
      expect(state.status()).toBe("ready")
      expect(state.models().map((model) => model.id)).toEqual(["shared"])
      expect(state.dataStatus()).toBe("ready")
    })
    return rootDispose
  })
  await effectsSettle()
  await effectsSettle()
  dispose()
})

test("a failed revalidation keeps retained models and reports the stale data status", async () => {
  const accountId = accountIdCreate()
  let catalogRequests = 0
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      accountId,
      fetch: async (input) => {
        const url = String(input)
        if (url.includes("/api/providers/catalog")) {
          catalogRequests += 1
          if (catalogRequests > 1) return response({ error: "unavailable" }, 500)
          return response(
            {
              providers: [catalogProvider("codex-lb", [catalogModel("codex-lb", "shared")])],
              revision: catalogRevision,
            },
            200,
            { ETag: etag("catalog-1") },
          )
        }
        if (url.includes("/agents/")) return response(agentDetail("codex-lb", "shared"))
        return response(sessionDetail("session-1"))
      },
      isOnline: () => true,
      sessionId: () => "session-1",
    })
    void effectsSettle().then(async () => {
      expect(state.status()).toBe("ready")
      state.refresh()
      await effectsSettle()
      expect(state.models().map((model) => model.id)).toEqual(["shared"])
      expect(state.dataStatus()).toBe("stale")
    })
    return rootDispose
  })
  await effectsSettle()
  await effectsSettle()
  dispose()
})

test("offline reporting wins over an in-flight revalidation", async () => {
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: routedFetch({
        agent: () => response(agentDetail("codex-lb", "shared")),
        catalog: () =>
          response({
            providers: [catalogProvider("codex-lb", [catalogModel("codex-lb", "shared")])],
            revision: catalogRevision,
          }),
      }),
      isOnline: () => false,
      sessionId: () => "session-1",
    })
    void effectsSettle().then(() => expect(state.dataStatus()).toBe("offline"))
    return rootDispose
  })
  await effectsSettle()
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
      accountId: accountIdCreate(),
      fetch: routedFetch({
        agent: () => response(agentDetail("codex-lb", "alpha")),
        catalog: () =>
          response({
            providers: [
              catalogProvider("codex-lb", [
                catalogModel("codex-lb", "alpha", { efforts: ["medium", "high"] }),
                catalogModel("codex-lb", "beta", { efforts: ["low", "high"] }),
                catalogModel("codex-lb", "gamma", { efforts: ["low"] }),
              ]),
            ],
            revision: catalogRevision,
          }),
      }),
      isOnline: () => true,
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
      accountId: accountIdCreate(),
      fetch: routedFetch({
        agent: () => response(agentDetail("codex-lb", "configured")),
        catalog: () =>
          response({
            providers: [
              catalogProvider("cliproxyapi", [catalogModel("cliproxyapi", "shared", { efforts: ["high"] })]),
              catalogProvider("codex-lb", [catalogModel("codex-lb", "shared", { efforts: ["high"] })]),
            ],
            revision: catalogRevision,
          }),
      }),
      isOnline: () => true,
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
      accountId: accountIdCreate(),
      fetch: routedFetch({
        agent: () => response(agentDetail("codex-lb", "missing")),
        catalog: () =>
          response({
            providers: [
              catalogProvider("codex-lb", [catalogModel("codex-lb", "zeta")]),
              catalogProvider("cliproxyapi", [catalogModel("cliproxyapi", "alpha")]),
            ],
            revision: catalogRevision,
          }),
      }),
      isOnline: () => true,
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

test("selector reports an error when the catalog is unavailable", async () => {
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: routedFetch({
        agent: () => response(agentDetail("deterministic", "configured")),
        catalog: () => response({ error: "unavailable" }, 500),
      }),
      isOnline: () => true,
      sessionId: () => "session-1",
    })
    void effectsSettle().then(() => expect(state.status()).toBe("error"))
    return rootDispose
  })
  await effectsSettle()
  dispose()
})
