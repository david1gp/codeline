import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { providerModelSelectionStateCreate } from "../src/providers/providerModelSelectionStateCreate.js"
import { providerModelSelectionPersistenceSchema } from "../src/providers/schema/providerModelSelectionPersistenceSchema.js"

const deterministicConfiguration = (model: string) => ({ provider: "deterministic" as const, model })
const remoteConfiguration = (provider: "cliproxyapi" | "codex-lb", model: string) => ({
  apiKey: provider === "cliproxyapi" ? ("$CLIPROXYAPI_API_KEY" as const) : ("$CODEX_LB_API_TOKEN" as const),
  baseUrl: "https://provider.test/v1",
  model,
  provider,
})

test("model selection uses a valid configured model and falls back to discovery order", () => {
  const dispose = createRoot((rootDispose) => {
    const models = () => [{ id: "first" }, { id: "second" }]
    const configured = providerModelSelectionStateCreate(() => deterministicConfiguration("second"), models)
    expect(configured.selectedModel()).toBe("second")

    const unavailable = providerModelSelectionStateCreate(() => deterministicConfiguration("missing"), models)
    expect(unavailable.selectedModel()).toBe("first")
    return rootDispose
  })
  dispose()
})

test("selection deterministically follows discovery changes and reports no selection when empty", () => {
  const dispose = createRoot((rootDispose) => {
    let discovered = [{ id: "configured" }, { id: "other" }]
    const state = providerModelSelectionStateCreate(
      () => deterministicConfiguration("configured"),
      () => discovered,
    )
    expect(state.selectedModel()).toBe("configured")

    discovered = [{ id: "replacement" }, { id: "another" }]
    expect(state.selectedModel()).toBe("replacement")
    discovered = []
    expect(state.selectedModel()).toBeNull()
    return rootDispose
  })
  dispose()
})

test("persisted selections are scoped by provider and invalid choices are rejected", () => {
  const dispose = createRoot((rootDispose) => {
    let configuration = remoteConfiguration("cliproxyapi", "configured")
    const initialPersistence = {
      selections: [
        { model: "codex-model", provider: "codex-lb" as const },
        { model: "cli-model", provider: "cliproxyapi" as const },
      ],
    }
    const state = providerModelSelectionStateCreate(
      () => configuration,
      () => [{ id: "configured" }, { id: "cli-model" }, { id: "codex-model" }],
      initialPersistence,
    )
    expect(state.selectedModel()).toBe("cli-model")
    expect(state.persistedSelection()).toEqual({ model: "cli-model", provider: "cliproxyapi" })
    expect(state.modelSelect("missing")).toBe(false)
    expect(state.selectedModel()).toBe("cli-model")
    expect(state.modelSelect("configured")).toBe(true)
    expect(state.persistence()).toEqual({
      selections: [
        { model: "codex-model", provider: "codex-lb" },
        { model: "configured", provider: "cliproxyapi" },
      ],
    })
    configuration = remoteConfiguration("codex-lb", "configured")
    expect(state.selectedModel()).toBe("codex-model")
    expect(state.persistedSelection()).toEqual({ model: "codex-model", provider: "codex-lb" })
    return rootDispose
  })
  dispose()
})

test("persisted selection is absent when the provider model is not discovered", () => {
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectionStateCreate(
      () => deterministicConfiguration("configured"),
      () => [{ id: "configured" }],
      { selections: [{ provider: "deterministic", model: "missing" }] },
    )
    expect(state.selectedModel()).toBe("configured")
    expect(state.persistedSelection()).toBeNull()
    return rootDispose
  })
  dispose()
})

test("persistence is validated and remains JSON serializable", () => {
  const dispose = createRoot((rootDispose) => {
    const state = providerModelSelectionStateCreate(
      () => deterministicConfiguration("configured"),
      () => [{ id: "configured" }],
      { selections: [{ provider: "unknown", model: "secret" }] },
    )
    expect(state.persistence()).toEqual({ selections: [] })
    expect(JSON.parse(JSON.stringify(state.persistence()))).toEqual(state.persistence())
    expect(v.safeParse(providerModelSelectionPersistenceSchema, state.persistence()).success).toBe(true)
    return rootDispose
  })
  dispose()
})
