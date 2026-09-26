import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"
import type { GlobalAgentPresetDocument } from "../../../src/configuration/globalAgentPresetDocumentSchema.js"
import type { ProviderApiAgentsResponse } from "../../../src/providers/api/providerApiAgentsResponseSchema.js"

mock.module("solid-js", () => solidRuntime)
type DragConfig = {
  dragHandle?: string
  draggable: (child: HTMLElement) => boolean
  onDragstart: () => void
  onTransfer: (data: never) => void
  onDragend: (data: never) => void
}
const dragConfigs = new Map<object, DragConfig>()
mock.module("@formkit/drag-and-drop", () => ({
  dragAndDrop: ({ parent, config }: { parent: object; config: DragConfig }) => {
    dragConfigs.set(parent, config)
  },
  tearDown: (parent: object) => {
    dragConfigs.delete(parent)
  },
  parents: new Map(),
}))
const { globalAgentPresetEditorStateCreate } = await import(
  "../../../src/configuration/ui/globalAgentPresetEditorStateCreate.js"
)
const { globalAgentPresetClientCreate } = await import(
  "../../../src/configuration/client/globalAgentPresetClientCreate.js"
)
const { globalAgentPresetDocumentDefaults } = await import(
  "../../../src/configuration/globalAgentPresetDocumentDefaults.js"
)
const agentsClient = {
  list: async () => ({
    success: true as const,
    data: {
      agents: [
        { id: "reviewer", enabled: true, mode: "subagent" as const },
        { id: "disabled", enabled: false, mode: "subagent" as const },
        { id: "primary", enabled: true, mode: "primary" as const, provider: "codex-lb", model: "gpt-6" },
      ],
    } as ProviderApiAgentsResponse,
  }),
}
const catalogs = {} as never
const catalogFetch = async () =>
  ({
    success: true as const,
    data: {
      status: 200 as const,
      data: {
        revision: "1",
        providers: [
          {
            id: "codex-lb",
            name: "Codex",
            enabled: true,
            models: [
              { id: "gpt-6", name: "GPT 6", providerId: "codex-lb", selectable: true },
              { id: "hidden", name: "Hidden", providerId: "codex-lb", selectable: false },
            ],
          },
        ],
      },
    },
  }) as never
const presetState = (
  client: ReturnType<typeof globalAgentPresetClientCreate>,
  agents = agentsClient,
  models = catalogFetch,
) => globalAgentPresetEditorStateCreate(undefined, client, catalogs, agents, models)
const presetCreate = async (state: ReturnType<typeof presetState>) => {
  await state.entryCreate()
  await state.entryRename()
}
const resourceCatalogs = {
  skills: { list: async () => ({ success: true as const, data: { skills: ["review", "future"] } }) },
  commands: { list: async () => ({ success: true as const, data: { commands: ["test", "build"] } }) },
} as never

function fixture() {
  let persisted: GlobalAgentPresetDocument = globalAgentPresetDocumentDefaults()
  let fail = false
  const requests: string[] = []
  const client = globalAgentPresetClientCreate(async (input, init) => {
    requests.push(`${init?.method} ${input}`)
    if (init?.method === "PUT") {
      if (fail) return Response.json({ error: { code: "bad_request", message: "Save failed" } }, { status: 400 })
      persisted = JSON.parse(init.body as string)
    }
    return Response.json(persisted)
  })
  return {
    client,
    requests,
    get: () => persisted,
    fail: (value: boolean) => {
      fail = value
    },
  }
}

test("set editor persists named sets, default selection and overlapping memberships without deleting resources", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: globalAgentPresetEditorStateCreate("tools", server.client) }))
  try {
    const state = root.state
    await state.load()
    expect(state.selectedNames()).toContain("bash")
    await state.membershipChange("bash", false)
    expect(state.selectedNames()).not.toContain("bash")
    expect(server.get().categories.tools.sets[0]?.includeNewResources).toBe(false)
    await state.entryCreate()
    const second = state.activeSet()!
    await state.membershipChange("read", true)
    expect(server.get().categories.tools.sets[0]?.resourceNames).toContain("read")
    expect(state.selectedId()).toBe(second.id)
    await state.defaultChoose()
    expect(server.get().categories.tools.defaultSetId).toBe(second.id)
    await state.entryDelete()
    expect(state.error()).toContain("Choose another default")
    state.select("default-tools")
    await state.entryDelete()
    expect(server.get().categories.tools.sets).toHaveLength(1)
    expect(server.requests).toContain("PUT /api/global/agent-presets")
  } finally {
    root.dispose()
  }
})

test("preset editor persists multiple set references, individual subagents and baseline fields; failed writes keep state", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client) }))
  try {
    const state = root.state
    await state.load()
    await presetCreate(state)
    state.nameInput({ currentTarget: { value: "Review" } } as never)
    state.agentInput({ currentTarget: { value: "primary" } } as never)
    state.modelInput({ currentTarget: { value: "codex-lb/gpt-6" } } as never)
    await state.entryRename()
    await state.presetMembershipChange("skillSetIds", "default-skills", true)
    await state.presetMembershipChange("toolSetIds", "default-tools", true)
    await state.presetMembershipChange("subagentNames", "reviewer", true)
    await state.presetMembershipChange("subagentNames", "reviewer", true)
    expect(state.activePreset()).toMatchObject({
      name: "Review",
      executionAgentId: "primary",
      modelId: "codex-lb/gpt-6",
      subagentNames: ["reviewer"],
      skillSetIds: ["default-skills"],
      toolSetIds: ["default-tools"],
    })
    server.fail(true)
    await state.presetMembershipChange("skillSetIds", "default-skills", false)
    expect(state.error()).toBe("Save failed")
    expect(state.activePreset()?.skillSetIds).toEqual(["default-skills"])
    server.fail(false)
    await state.entryDelete()
    expect(server.get().presets).toEqual([])
  } finally {
    root.dispose()
  }
})

test("new presets prefill a selectable catalog model and primary agent without storing a placeholder", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client) }))
  try {
    const state = root.state
    await state.load()
    await state.entryCreate()
    expect(state.executionAgentId()).toBe("primary")
    expect(state.modelId()).toBe("codex-lb/gpt-6")
    expect(state.modelOptions()).toEqual([{ id: "codex-lb/gpt-6", label: "Codex / GPT 6", providerId: "codex-lb" }])
    expect(server.get().presets).toEqual([])
    await state.entryRename()
    expect(server.get().presets[0]).toMatchObject({ executionAgentId: "primary", modelId: "codex-lb/gpt-6" })
  } finally {
    root.dispose()
  }
})

test("unavailable agent or model keeps a required draft unsaved until valid choices are selected", async () => {
  const server = fixture()
  const unavailableAgents = { list: async () => ({ success: true as const, data: { agents: [] } }) }
  const unavailableCatalog = async () =>
    ({ success: false as const, op: "providerCatalogFetch", errorMessage: "Catalog unavailable" }) as never
  const root = createRoot((dispose) => ({
    dispose,
    state: presetState(server.client, unavailableAgents, unavailableCatalog),
  }))
  try {
    const state = root.state
    await state.load()
    await state.entryCreate()
    expect(state.fieldsValid()).toBe(false)
    expect(state.executionAgentId()).toBe("")
    expect(state.modelId()).toBe("")
    expect(state.catalogError()).toBe("Catalog unavailable")
    await state.entryRename()
    expect(server.get().presets).toEqual([])
    expect(server.requests.filter((request) => request.startsWith("PUT"))).toEqual([])
    await state.presetMembershipChange("toolSetIds", "default-tools", true)
    expect(server.get().presets).toEqual([])
    state.agentInput({ currentTarget: { value: "made-up" } } as never)
    state.modelInput({ currentTarget: { value: "default" } } as never)
    expect(state.fieldsValid()).toBe(false)
  } finally {
    root.dispose()
  }
})

test("preset creation and subsequent edits retain explicitly chosen agent, model and set memberships", async () => {
  const server = fixture()
  const choices = {
    list: async () => ({
      success: true as const,
      data: {
        agents: [
          { id: "first", enabled: true, mode: "primary" as const, provider: "codex-lb", model: "one" },
          { id: "second", enabled: true, mode: "primary" as const, provider: "codex-lb", model: "two" },
        ],
      },
    }),
  }
  const models = async () =>
    ({
      success: true as const,
      data: {
        status: 200 as const,
        data: {
          revision: "1",
          providers: [
            {
              id: "codex-lb",
              name: "Codex",
              enabled: true,
              models: [
                { id: "one", name: "One", providerId: "codex-lb", selectable: true },
                { id: "two", name: "Two", providerId: "codex-lb", selectable: true },
              ],
            },
          ],
        },
      },
    }) as never
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client, choices, models) }))
  try {
    const state = root.state
    await state.load()
    await state.entryCreate()
    state.agentInput({ currentTarget: { value: "second" } } as never)
    state.modelInput({ currentTarget: { value: "codex-lb/two" } } as never)
    await state.entryRename()
    await state.presetMembershipChange("skillSetIds", "default-skills", true)
    expect(server.get().presets[0]).toMatchObject({
      executionAgentId: "second",
      modelId: "codex-lb/two",
      skillSetIds: ["default-skills"],
    })
    state.agentInput({ currentTarget: { value: "first" } } as never)
    state.modelInput({ currentTarget: { value: "codex-lb/one" } } as never)
    await state.entryRename()
    expect(server.get().presets[0]).toMatchObject({
      executionAgentId: "first",
      modelId: "codex-lb/one",
      skillSetIds: ["default-skills"],
    })
  } finally {
    root.dispose()
  }
})

test("preset model choices follow the execution agent provider and reject incompatible or unavailable selections", async () => {
  const server = fixture()
  const choices = {
    list: async () => ({
      success: true as const,
      data: {
        agents: [
          { id: "alpha", enabled: true, mode: "primary" as const, provider: "cliproxyapi", model: "a" },
          { id: "beta", enabled: true, mode: "primary" as const, provider: "codex-lb", model: "b" },
          { id: "offline", enabled: true, mode: "primary" as const, provider: "missing", model: "nope" },
          { id: "unresolved", enabled: true, mode: "primary" as const },
        ],
      },
    }),
  }
  const models = async () =>
    ({
      success: true as const,
      data: {
        status: 200 as const,
        data: {
          revision: "1",
          providers: [
            {
              id: "codex-lb",
              name: "Codex",
              enabled: true,
              models: [{ id: "b", name: "B", providerId: "codex-lb", selectable: true }],
            },
            {
              id: "cliproxyapi",
              name: "Proxy",
              enabled: true,
              models: [
                { id: "a", name: "A", providerId: "cliproxyapi", selectable: true },
                { id: "off", name: "Off", providerId: "cliproxyapi", selectable: false },
              ],
            },
          ],
        },
      },
    }) as never
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client, choices as never, models) }))
  try {
    const state = root.state
    await state.load()
    await state.entryCreate()
    expect(state.modelId()).toBe("cliproxyapi/a")
    expect(state.modelOptions().map((item) => item.id)).toEqual(["cliproxyapi/a"])
    state.modelInput({ currentTarget: { value: "codex-lb/b" } } as never)
    expect(state.fieldsValid()).toBe(false)
    await state.entryRename()
    expect(server.get().presets).toEqual([])
    state.agentInput({ currentTarget: { value: "beta" } } as never)
    expect(state.modelId()).toBe("codex-lb/b")
    await state.entryRename()
    expect(server.get().presets[0]).toMatchObject({ executionAgentId: "beta", modelId: "codex-lb/b" })
    state.agentInput({ currentTarget: { value: "offline" } } as never)
    expect(state.modelOptions()).toEqual([])
    expect(state.modelBlockedReason()).toContain("No selectable models")
    expect(state.fieldsValid()).toBe(false)
    await state.entryRename()
    expect(server.get().presets[0]?.executionAgentId).toBe("beta")
    state.agentInput({ currentTarget: { value: "unresolved" } } as never)
    expect(state.modelBlockedReason()).toContain("no available provider")
    state.agentInput({ currentTarget: { value: "deleted" } } as never)
    expect(state.modelBlockedReason()).toContain("available execution agent")
    expect(server.requests.filter((request) => request.startsWith("PUT"))).toHaveLength(1)
  } finally {
    root.dispose()
  }
})

test("subagent sets and presets accept only enabled subagent IDs from the global catalog", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({
    dispose,
    set: globalAgentPresetEditorStateCreate("subagents", server.client, catalogs, agentsClient),
    preset: presetState(server.client),
  }))
  try {
    await root.set.load()
    await root.preset.load()
    expect(root.set.availableNames()).toEqual(["reviewer"])
    expect(await root.set.membershipChange("disabled", true)).toBe(false)
    expect(await root.set.membershipChange("made-up", true)).toBe(false)
    expect(server.get().categories.subagents.sets[0]?.resourceNames).toEqual([])
    await root.set.membershipChange("reviewer", true)
    expect(root.set.selectedNames()).toEqual(["reviewer"])
    await presetCreate(root.preset)
    await root.preset.presetMembershipChange("subagentNames", "primary", true)
    expect(server.get().presets[0]?.subagentNames).toEqual([])
    await root.preset.presetMembershipChange("subagentNames", "reviewer", true)
    expect(server.get().presets[0]?.subagentNames).toEqual(["reviewer"])
  } finally {
    root.dispose()
  }
})

test("checkbox removal in default skill and subagent sets preserves dynamic inclusion and restores excluded names", async () => {
  for (const category of ["skills", "subagents"] as const) {
    const server = fixture()
    const root = createRoot((dispose) => ({
      dispose,
      state: globalAgentPresetEditorStateCreate(category, server.client, resourceCatalogs, agentsClient),
    }))
    try {
      const state = root.state
      await state.load()
      const setId = `default-${category}`
      const removed = category === "skills" ? "review" : "reviewer"
      expect(state.selectedNames()).toContain(removed)
      await state.membershipChange(removed, false)
      expect(state.selectedNames()).not.toContain(removed)
      expect(state.activeSet()).toMatchObject({
        includeNewResources: true,
        resourceNames: [],
        excludedResourceNames: [removed],
      })
      expect(state.availableNames()).toContain(removed)
      if (category === "skills") expect(state.selectedNames()).toContain("future")
      await state.membershipChange(removed, true)
      expect(state.selectedNames()).toContain(removed)
      expect(server.get().categories[category].sets[0]!.excludedResourceNames).toEqual([])
      await state.memberDropOutside(removed, setId)
      expect(state.selectedNames()).not.toContain(removed)
      expect(state.activeSet()?.includeNewResources).toBe(true)
      await state.catalogAssign(removed, setId)
      expect(state.selectedNames()).toContain(removed)
    } finally {
      root.dispose()
    }
  }
})

test("default command checkbox and move remove only membership; future commands remain dynamic", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({
    dispose,
    state: globalAgentPresetEditorStateCreate("commands", server.client, resourceCatalogs),
  }))
  try {
    const state = root.state
    await state.load()
    await state.membershipChange("test", false)
    expect(state.selectedNames()).toEqual(["build"])
    expect(state.activeSet()).toMatchObject({ includeAllResources: true, excludedResourceNames: ["test"] })
    await state.membershipChange("test", true)
    expect(state.selectedNames()).toEqual(["test", "build"])
    await state.entryCreate()
    const target = state.selectedId()!
    state.transferRequest("test", "default-commands", target)
    expect(await state.transferConfirm("move")).toBe(true)
    expect(server.get().categories.commands.sets[0]).toMatchObject({
      includeAllResources: true,
      excludedResourceNames: ["test"],
    })
    expect(state.selectedNames()).toEqual(["test"])
    expect(state.availableNames()).toContain("test")
    state.select("default-commands")
    expect(state.selectedNames()).toEqual(["build"])
    await state.memberDropOutside("build", "default-commands")
    expect(state.activeSet()).toMatchObject({ includeAllResources: true, excludedResourceNames: ["test", "build"] })
    await state.catalogAssign("build", "default-commands")
    expect(state.selectedNames()).toEqual(["build"])
  } finally {
    root.dispose()
  }
})

test("drag assignment copies by default, confirms moves, cancels without mutation and deduplicates names", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: globalAgentPresetEditorStateCreate("tools", server.client) }))
  try {
    const state = root.state
    await state.load()
    await state.entryCreate()
    const target = state.activeSet()!.id
    const before = server.requests.length
    state.transferRequest("bash", "default-tools", target)
    expect(state.pendingMove()).toMatchObject({ resource: "bash", targetId: target })
    state.transferCancel()
    expect(server.requests).toHaveLength(before)
    expect(server.get().categories.tools.sets[1]?.resourceNames).toEqual([])
    state.transferRequest("bash", "default-tools", target)
    await state.transferConfirm("copy")
    expect(state.pendingMove()).toBeUndefined()
    expect(state.selectedNames()).toContain("bash")
    expect(server.get().categories.tools.sets[0]?.includeNewResources).toBe(false)
    state.transferRequest("bash", "default-tools", target)
    await state.transferConfirm("move")
    expect(server.get().categories.tools.sets[0]?.resourceNames).not.toContain("bash")
    expect(server.get().categories.tools.sets[1]?.resourceNames).toEqual(["bash"])
    await state.catalogAssign("bash", target)
    expect(server.get().categories.tools.sets[1]?.resourceNames).toEqual(["bash"])
    await state.memberDropOutside("bash", target)
    expect(server.get().categories.tools.sets[1]?.resourceNames).toEqual([])
    expect(state.availableNames()).toContain("bash")
  } finally {
    root.dispose()
  }
})

test("dropping sets into a preset assigns each reference only once", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client) }))
  try {
    const state = root.state
    await state.load()
    await presetCreate(state)
    expect(await state.presetDrop("tools", "default-tools")).toBe(true)
    expect(await state.presetDrop("tools", "default-tools")).toBe(false)
    expect(state.activePreset()?.toolSetIds).toEqual(["default-tools"])
    await state.presetMemberDropOutside("tools:default-tools")
    expect(state.activePreset()?.toolSetIds).toEqual([])
    expect(server.get().categories.tools.sets).toHaveLength(1)
  } finally {
    root.dispose()
  }
})

test("FormKit member chips attach after rendering and route transfers through the Copy/Move dialog", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: globalAgentPresetEditorStateCreate("tools", server.client) }))
  try {
    const state = root.state
    await state.load()
    await state.entryCreate()
    const targetId = state.activeSet()!.id
    const source = {} as HTMLElement
    const target = {} as HTMLElement
    state.dragListAttach(source, "set", "default-tools", () => ["bash"])
    state.dragListAttach(target, "set", targetId, () => [])
    expect(dragConfigs.has(source)).toBe(false)
    await Promise.resolve()
    const config = dragConfigs.get(source)!
    expect(config.dragHandle).toBeUndefined()
    expect(
      config.draggable({ hasAttribute: (name: string) => name === "data-drag-member" } as unknown as HTMLElement),
    ).toBe(true)
    const transfer = {
      sourceParent: { el: source },
      targetParent: { el: target },
      draggedNodes: [{ data: { value: "bash" } }],
    } as never
    config.onTransfer(transfer)
    expect(state.pendingMove()).toMatchObject({ resource: "bash", sourceId: "default-tools", targetId })
    state.transferCancel()
    expect(server.get().categories.tools.sets[1]?.resourceNames).toEqual([])
    config.onTransfer(transfer)
    await state.transferConfirm("copy")
    expect(server.get().categories.tools.sets[1]?.resourceNames).toEqual(["bash"])
  } finally {
    root.dispose()
    dragConfigs.clear()
  }
})

test("FormKit catalog set to preset Skill sets assigns the set ID once through both parent callbacks", async () => {
  const server = fixture()
  server
    .get()
    .categories.skills.sets.push({
      id: "new-skills",
      name: "New set 1",
      resourceNames: [],
      includeNewResources: false,
      includeAllResources: false,
    })
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client) }))
  try {
    const state = root.state
    await state.load()
    await presetCreate(state)
    const source = {} as HTMLElement
    const target = {} as HTMLElement
    state.dragListAttach(source, "catalog", "skills:sets", () => ["skills:default-skills", "skills:new-skills"])
    state.dragListAttach(target, "preset", state.selectedId()!, () => ["skills:default-skills", "skills:new-skills"])
    await Promise.resolve()
    const before = server.requests.length
    const transfer = {
      sourceParent: { el: source },
      targetParent: { el: target },
      initialParent: { el: source },
      draggedNodes: [{ data: { value: "skills:new-skills" } }],
    } as never
    dragConfigs.get(target)!.onTransfer(transfer)
    expect(server.requests).toHaveLength(before)
    dragConfigs.get(source)!.onTransfer(transfer)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.activePreset()?.skillSetIds).toEqual(["new-skills"])
    expect(server.get().presets[0]?.skillSetIds).toEqual(["new-skills"])
    expect(server.requests).toHaveLength(before + 1)
    dragConfigs.get(source)!.onTransfer(transfer)
    await Promise.resolve()
    expect(server.requests).toHaveLength(before + 1)
    expect(state.pendingMove()).toBeUndefined()
  } finally {
    root.dispose()
    dragConfigs.clear()
  }
})

test("FormKit transfers between preset category lists retain the dragged category and deduplicate membership", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client) }))
  try {
    const state = root.state
    await state.load()
    await presetCreate(state)
    const source = {} as HTMLElement
    const target = {} as HTMLElement
    state.dragListAttach(source, "preset", state.selectedId()!, () => ["skills:default-skills"])
    state.dragListAttach(target, "preset", state.selectedId()!, () => ["tools:default-tools"])
    await Promise.resolve()
    const before = server.requests.length
    const transfer = {
      sourceParent: { el: source },
      targetParent: { el: target },
      initialParent: { el: source },
      draggedNodes: [{ data: { value: "skills:default-skills" } }],
    } as never
    dragConfigs.get(target)!.onTransfer(transfer)
    dragConfigs.get(source)!.onTransfer(transfer)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.activePreset()?.skillSetIds).toEqual(["default-skills"])
    expect(state.activePreset()?.toolSetIds).toEqual([])
    expect(server.get().presets[0]?.skillSetIds).toEqual(["default-skills"])
    expect(server.requests).toHaveLength(before + 1)
    dragConfigs.get(source)!.onTransfer(transfer)
    await Promise.resolve()
    expect(server.requests).toHaveLength(before + 1)
    expect(state.pendingMove()).toBeUndefined()
  } finally {
    root.dispose()
    dragConfigs.clear()
  }
})

test("FormKit outside drop removes only the source set membership", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: globalAgentPresetEditorStateCreate("tools", server.client) }))
  const previousDocument = globalThis.document
  const listeners = new Map<string, (event: MouseEvent) => void>()
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      addEventListener: (name: string, handler: (event: MouseEvent) => void) => listeners.set(name, handler),
      removeEventListener: (name: string) => listeners.delete(name),
      elementFromPoint: () => ({}),
    },
  })
  try {
    const state = root.state
    await state.load()
    const source = { contains: () => false } as unknown as HTMLElement
    state.dragListAttach(source, "set", "default-tools", () => ["bash"])
    await Promise.resolve()
    const config = dragConfigs.get(source)!
    // onDragstart installs the point tracker; invoke it through the actual config.
    config.onDragstart()
    listeners.get("dragover")!({ clientX: 30, clientY: 40 } as MouseEvent)
    config.onDragend({
      parent: { el: source },
      state: { initialParent: { el: source } },
      draggedNode: { data: { value: "bash" } },
    } as never)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(server.get().categories.tools.sets[0]?.resourceNames).not.toContain("bash")
    expect(state.availableNames()).toContain("bash")
  } finally {
    root.dispose()
    dragConfigs.clear()
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument })
  }
})

test("FormKit category transfer keeps source membership pending Copy/Move when drag ends outside", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: globalAgentPresetEditorStateCreate("tools", server.client) }))
  const previousDocument = globalThis.document
  const listeners = new Map<string, (event: MouseEvent) => void>()
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      addEventListener: (name: string, handler: (event: MouseEvent) => void) => listeners.set(name, handler),
      removeEventListener: (name: string) => listeners.delete(name),
      elementFromPoint: () => ({}),
    },
  })
  try {
    const state = root.state
    await state.load()
    await state.entryCreate()
    const targetId = state.selectedId()!
    const source = { contains: () => false } as unknown as HTMLElement
    const target = { contains: () => false } as unknown as HTMLElement
    state.dragListAttach(source, "set", "default-tools", () => ["bash"])
    state.dragListAttach(target, "set", targetId, () => [])
    await Promise.resolve()
    const config = dragConfigs.get(source)!
    const before = server.requests.length
    config.onDragstart()
    listeners.get("dragover")!({ clientX: 30, clientY: 40 } as MouseEvent)
    config.onTransfer({
      sourceParent: { el: source },
      targetParent: { el: target },
      draggedNodes: [{ data: { value: "bash" } }],
    } as never)
    config.onDragend({
      parent: { el: target },
      state: { initialParent: { el: source } },
      draggedNode: { data: { value: "bash" } },
    } as never)
    await Promise.resolve()
    expect(state.pendingMove()).toMatchObject({ sourceId: "default-tools", targetId, resource: "bash" })
    expect(server.requests).toHaveLength(before)
    expect(state.selectedNames()).toEqual([])
  } finally {
    root.dispose()
    dragConfigs.clear()
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument })
  }
})

test("FormKit outside drop unassigns an assigned preset set even after crossing another drop list", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client) }))
  const previousDocument = globalThis.document
  const listeners = new Map<string, (event: MouseEvent) => void>()
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      addEventListener: (name: string, handler: (event: MouseEvent) => void) => listeners.set(name, handler),
      removeEventListener: (name: string) => listeners.delete(name),
      elementFromPoint: () => ({}),
    },
  })
  try {
    const state = root.state
    await state.load()
    await presetCreate(state)
    await state.presetDrop("skills", "default-skills")
    const source = { contains: () => false } as unknown as HTMLElement
    const other = { contains: () => false } as unknown as HTMLElement
    state.dragListAttach(source, "preset", state.selectedId()!, () => ["skills:default-skills"])
    state.dragListAttach(other, "preset", state.selectedId()!, () => ["skills:default-skills"])
    await Promise.resolve()
    const config = dragConfigs.get(source)!
    const before = server.requests.length
    config.onDragstart()
    listeners.get("pointermove")!({ clientX: 30, clientY: 40 } as MouseEvent)
    config.onTransfer({
      sourceParent: { el: source },
      targetParent: { el: other },
      draggedNodes: [{ data: { value: "skills:default-skills" } }],
    } as never)
    config.onDragend({
      parent: { el: other },
      state: { initialParent: { el: source } },
      draggedNode: { data: { value: "skills:default-skills" } },
    } as never)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(server.get().presets[0]?.skillSetIds).toEqual([])
    expect(server.get().categories.skills.sets).toHaveLength(1)
    expect(server.requests).toHaveLength(before + 1)
  } finally {
    root.dispose()
    dragConfigs.clear()
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument })
  }
})

test("FormKit preset reorder across drop lists does not unassign its set", async () => {
  const server = fixture()
  const root = createRoot((dispose) => ({ dispose, state: presetState(server.client) }))
  const previousDocument = globalThis.document
  const listeners = new Map<string, (event: MouseEvent) => void>()
  const source = { contains: () => false } as unknown as HTMLElement
  const target = { contains: (element: object) => element === hovered } as unknown as HTMLElement
  const hovered = {} as HTMLElement
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      addEventListener: (name: string, handler: (event: MouseEvent) => void) => listeners.set(name, handler),
      removeEventListener: (name: string) => listeners.delete(name),
      elementFromPoint: () => hovered,
    },
  })
  try {
    const state = root.state
    await state.load()
    await presetCreate(state)
    await state.presetDrop("skills", "default-skills")
    state.dragListAttach(source, "preset", state.selectedId()!, () => ["skills:default-skills"])
    state.dragListAttach(target, "preset", state.selectedId()!, () => ["skills:default-skills"])
    await Promise.resolve()
    const before = server.requests.length
    const config = dragConfigs.get(source)!
    config.onDragstart()
    listeners.get("dragover")!({ clientX: 30, clientY: 40 } as MouseEvent)
    config.onTransfer({
      sourceParent: { el: source },
      targetParent: { el: target },
      draggedNodes: [{ data: { value: "skills:default-skills" } }],
    } as never)
    config.onDragend({
      parent: { el: target },
      state: { initialParent: { el: source } },
      draggedNode: { data: { value: "skills:default-skills" } },
    } as never)
    await Promise.resolve()
    expect(server.get().presets[0]?.skillSetIds).toEqual(["default-skills"])
    expect(server.requests).toHaveLength(before)
  } finally {
    root.dispose()
    dragConfigs.clear()
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument })
  }
})
