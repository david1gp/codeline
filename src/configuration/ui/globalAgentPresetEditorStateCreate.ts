import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { onMount } from "solid-js"
import { dragAndDrop, parents, tearDown } from "@formkit/drag-and-drop"
import { onCleanup } from "solid-js"
import { globalAgentPresetClientCreate } from "../client/globalAgentPresetClientCreate.js"
import { globalResourceClientCreate } from "../client/globalResourceClientCreate.js"
import type { GlobalAgentPresetDocument } from "../globalAgentPresetDocumentSchema.js"
import { globalAgentPresetResourcesResolve, type GlobalAgentPresetResourceCategory } from "../globalAgentPresetResourcesResolve.js"
import { globalAgentPresetSetMembershipChange } from "../globalAgentPresetSetMembershipChange.js"
import { toolNameSchema } from "../../tools/schema/toolNameSchema.js"
import { providerAgentsClientCreate } from "../../providers/client/providerAgentsClientCreate.js"
import { providerCatalogFetch } from "../../providers/client/providerCatalogFetch.js"
import type { ProviderApiAgentsResponse } from "../../providers/api/providerApiAgentsResponseSchema.js"

type ModelOption = { id: string; label: string; providerId: string }

type Category = GlobalAgentPresetResourceCategory
type SetEntry = GlobalAgentPresetDocument["categories"][Category]["sets"][number]
type Preset = GlobalAgentPresetDocument["presets"][number]
type Field = "skillSetIds" | "commandSetIds" | "toolSetIds" | "subagentSetIds" | "subagentNames"
const fields: Record<Category, Field> = {
  skills: "skillSetIds", commands: "commandSetIds", tools: "toolSetIds", subagents: "subagentSetIds",
}

export function globalAgentPresetEditorStateCreate(
  category?: Category,
  client = globalAgentPresetClientCreate(),
  catalogs = { skills: globalResourceClientCreate("skills"), commands: globalResourceClientCreate("commands") },
  agentsClient = providerAgentsClientCreate(),
  catalogFetch: typeof providerCatalogFetch = providerCatalogFetch,
) {
  const document = createSignalObject<GlobalAgentPresetDocument | undefined>(undefined)
  const names = createSignalObject<string[]>(category === "tools" ? [...toolNameSchema.options] : [])
  const agentsLoaded = createSignalObject(false)
  const executionAgents = createSignalObject<string[]>([])
  const agentDetails = createSignalObject<ProviderApiAgentsResponse["agents"]>([])
  const catalogModels = createSignalObject<ModelOption[]>([])
  const catalogError = createSignalObject("")
  const draft = createSignalObject<Preset | undefined>(undefined)
  const selectedId = createSignalObject<string | undefined>(undefined)
  const name = createSignalObject("")
  const executionAgentId = createSignalObject("")
  const modelId = createSignalObject("")
  const newResource = createSignalObject("")
  const busy = createSignalObject(false)
  const loading = createSignalObject(false)
  const error = createSignalObject("")
  const message = createSignalObject("")
  const pendingMove = createSignalObject<{ resource: string; sourceId: string; targetId: string } | undefined>(undefined)
  const lists = new Map<HTMLElement, { kind: "catalog" | "set" | "preset"; id: string }>()
  let transferred = false
  let lastPoint: { x: number; y: number } | undefined
  const pointTrack = (event: MouseEvent) => { lastPoint = { x: event.clientX, y: event.clientY } }

  const sets = () => category && document.get()?.categories[category].sets || []
  const presets = () => [...(document.get()?.presets || []), ...(draft.get() ? [draft.get()!] : [])]
  const activeSet = () => sets().find((set) => set.id === selectedId.get())
  const activePreset = () => presets().find((preset) => preset.id === selectedId.get())
  const selectedAgent = () => agentDetails.get().find((agent) => agent.id === executionAgentId.get())
  const modelOptions = () => catalogModels.get().filter((model) => model.providerId === selectedAgent()?.provider)
  const defaultModel = (agentId: string) => {
    const agent = agentDetails.get().find((item) => item.id === agentId)
    const id = `${agent?.provider}/${agent?.model}`
    return catalogModels.get().some((model) => model.id === id && model.providerId === agent?.provider) ? id : modelOptionsFor(agent?.provider)[0]?.id ?? ""
  }
  const modelOptionsFor = (provider?: string) => catalogModels.get().filter((model) => model.providerId === provider)
  const selectedNames = () => {
    const doc = document.get()
    const set = activeSet()
    return doc && set && category ? globalAgentPresetResourcesResolve(doc, category, [set.id], names.get()) : []
  }
  const availableNames = () => category === "subagents" ? names.get() : [...new Set([...names.get(), ...sets().flatMap((set) => set.resourceNames)])].sort()
  const individualNames = () => {
    const doc = document.get()
    const preset = activePreset()
    if (!doc || !preset) return []
    const fromSets = new Set(globalAgentPresetResourcesResolve(doc, "subagents", preset.subagentSetIds))
    return [...new Set(preset.subagentNames)].filter((item) => !fromSets.has(item))
  }

  const select = (id: string) => {
    if (busy.get()) return
    selectedId.set(id)
    const entry = category ? sets().find((set) => set.id === id) : presets().find((preset) => preset.id === id)
    name.set(entry?.name ?? "")
    const preset = category ? undefined : activePreset()
    executionAgentId.set(preset?.executionAgentId ?? "")
    modelId.set(preset?.modelId ?? "")
    newResource.set("")
    error.set("")
  }
  const load = async () => {
    if (busy.get()) return
    loading.set(true)
    error.set("")
    const result = await client.get()
    if (!result.success) {
      error.set(result.errorMessage)
      loading.set(false)
      return
    }
    document.set(result.data)
    draft.set(undefined)
    select(category ? result.data.categories[category].defaultSetId : result.data.presets[0]?.id ?? "")
    if (category === "skills" || category === "commands") {
      const listing = await catalogs[category].list()
      if (listing.success) names.set(listing.data[category] ?? [])
      else error.set(listing.errorMessage)
    }
    if (category === "subagents" || category === undefined) {
      agentsLoaded.set(false)
      names.set([])
      executionAgents.set([])
      agentDetails.set([])
      const listing = await agentsClient.list()
      if (listing.success) {
        names.set(listing.data.agents.filter((agent) => agent.enabled && agent.mode !== "primary").map((agent) => agent.id))
        executionAgents.set(listing.data.agents.filter((agent) => agent.enabled && agent.mode !== "subagent").map((agent) => agent.id))
        agentDetails.set(listing.data.agents)
        agentsLoaded.set(true)
      } else error.set(listing.errorMessage)
    }
    if (category === undefined) {
      catalogModels.set([])
      catalogError.set("")
      const listing = await catalogFetch()
      if (!listing.success) catalogError.set(listing.errorMessage)
      else if (listing.data.status === 200) catalogModels.set(listing.data.data.providers
        .filter((provider) => provider.enabled && (provider.id === "codex-lb" || provider.id === "cliproxyapi"))
        .flatMap((provider) => provider.models.filter((model) => model.selectable && model.providerId === provider.id)
          .map((model) => ({ id: `${provider.id}/${model.id}`, label: `${provider.name} / ${model.name}`, providerId: provider.id }))))
    }
    loading.set(false)
  }
  const save = async (next: GlobalAgentPresetDocument, after?: string) => {
    if (busy.get() || !document.get()) return false
    busy.set(true)
    error.set("")
    message.set("")
    const result = await client.put(next)
    busy.set(false)
    if (!result.success) {
      error.set(result.errorMessage)
      return false
    }
    document.set(result.data)
    if (after !== undefined) select(after)
    message.set("Saved global configuration.")
    return true
  }
  const categoryUpdate = (setsNext: SetEntry[], defaultSetId?: string) => {
    const doc = document.get()
    if (!doc || !category) return undefined
    return { ...doc, categories: { ...doc.categories, [category]: {
      defaultSetId: defaultSetId ?? doc.categories[category].defaultSetId, sets: setsNext,
    } } }
  }
  const setUpdate = async (update: (set: SetEntry) => SetEntry) => {
    const set = activeSet()
    if (!set) return false
    const next = categoryUpdate(sets().map((item) => item.id === set.id ? update(item) : item))
    return next ? save(next) : false
  }
  const entryCreate = async () => {
    const doc = document.get()
    if (!doc || busy.get() || draft.get()) return
    const id = crypto.randomUUID()
    if (category) {
      let index = 1
      while (sets().some((set) => set.name === `New set ${index}`)) index++
      const next = categoryUpdate([...sets(), { id, name: `New set ${index}`, resourceNames: [], includeNewResources: false, includeAllResources: false }])
      if (next) await save(next, id)
      return
    }
    let index = 1
    while (presets().some((preset) => preset.name === `New preset ${index}`)) index++
    const agentId = executionAgents.get()[0] ?? ""
    const preset: Preset = { id, name: `New preset ${index}`, skillSetIds: [], commandSetIds: [], toolSetIds: [], subagentSetIds: [], subagentNames: [], executionAgentId: agentId, modelId: defaultModel(agentId) }
    draft.set(preset)
    select(id)
  }
  const fieldsValid = () => !!name.get().trim() && executionAgents.get().includes(executionAgentId.get()) && modelOptions().some((model) => model.id === modelId.get())
  const entryRename = async () => {
    const doc = document.get()
    const id = selectedId.get()
    const nextName = name.get().trim()
    if (!doc || !id || !nextName) { error.set("Enter a name."); return }
    if (category) {
      if (sets().some((set) => set.id !== id && set.name === nextName)) { error.set("Set names must be unique."); return }
      const next = categoryUpdate(sets().map((set) => set.id === id ? { ...set, name: nextName } : set))
      if (next) await save(next)
      return
    }
    if (presets().some((preset) => preset.id !== id && preset.name === nextName)) { error.set("Preset names must be unique."); return }
    if (!fieldsValid()) { error.set("Choose an available execution agent and model before saving."); return }
    const next = presets().map((preset) => preset.id === id ? { ...preset, name: nextName, executionAgentId: executionAgentId.get(), modelId: modelId.get() } : preset)
    if (await save({ ...doc, presets: next })) { draft.set(undefined); select(id) }
  }
  const entryDelete = async () => {
    const doc = document.get()
    const id = selectedId.get()
    if (!doc || !id || busy.get()) return
    if (draft.get()?.id === id) { draft.set(undefined); select(doc.presets[0]?.id ?? ""); return }
    if (category) {
      if (doc.categories[category].defaultSetId === id) { error.set("Choose another default set before deleting this set."); return }
      const next = categoryUpdate(sets().filter((set) => set.id !== id))
      if (!next) return
      const field = fields[category]
      await save({ ...next, presets: doc.presets.map((preset) => ({ ...preset, [field]: preset[field].filter((setId) => setId !== id) })) }, doc.categories[category].defaultSetId)
      return
    }
    await save({ ...doc, presets: doc.presets.filter((preset) => preset.id !== id) }, doc.presets.find((preset) => preset.id !== id)?.id ?? "")
  }
  const defaultChoose = async () => {
    const doc = document.get()
    const id = selectedId.get()
    if (!doc || !category || !id) return
    const next = categoryUpdate(category === "commands" ? sets().map((set) => set.id === id
      ? { ...set, includeAllResources: true } : set) : sets(), id)
    if (next) await save(next)
  }
  const membershipChange = async (resource: string, enabled: boolean) => {
    if (!category || !activeSet() || !resource) return false
    if (category === "subagents" && enabled && (!agentsLoaded.get() || !names.get().includes(resource))) {
      error.set("Choose an available global subagent.")
      return false
    }
    return setUpdate((set) => globalAgentPresetSetMembershipChange(set, resource, enabled))
  }
  const setMembershipTransfer = async (resource: string, sourceId: string, targetId?: string, mode: "copy" | "move" = "copy") => {
    const doc = document.get()
    if (!doc || !category || busy.get() || !resource || !sets().some((set) => set.id === sourceId) || (targetId && !sets().some((set) => set.id === targetId))) return false
    if (category === "subagents" && targetId && (!agentsLoaded.get() || !names.get().includes(resource))) return false
    if (targetId === sourceId) return false
    const next = categoryUpdate(sets().map((set) => {
      if (set.id !== sourceId && set.id !== targetId) return set
      if (set.id === sourceId) {
        if (mode !== "move") return set
        return globalAgentPresetSetMembershipChange(set, resource, false)
      }
      return globalAgentPresetSetMembershipChange(set, resource, true)
    }))
    return next ? save(next) : false
  }
  const transferRequest = (resource: string, sourceId: string, targetId: string) => {
    if (busy.get() || !category || !resource || sourceId === targetId) return
    if (sourceId === "catalog") { void catalogAssign(resource, targetId); return }
    if (!sets().some((set) => set.id === sourceId) || !sets().some((set) => set.id === targetId)) return
    pendingMove.set({ resource, sourceId, targetId })
  }
  const transferConfirm = async (mode: "copy" | "move") => {
    const pending = pendingMove.get()
    if (!pending) return false
    const result = await setMembershipTransfer(pending.resource, pending.sourceId, pending.targetId, mode)
    if (result) pendingMove.set(undefined)
    return result
  }
  const transferCancel = () => pendingMove.set(undefined)
  const memberDropOutside = async (resource: string, sourceId: string) => {
    if (sourceId === "catalog") return false
    return setMembershipTransfer(resource, sourceId, undefined, "move")
  }
  const catalogAssign = async (resource: string, targetId: string) => {
    const doc = document.get()
    if (!doc || !category || busy.get() || !resource || !availableNames().includes(resource) || (category === "subagents" && !agentsLoaded.get()) || !sets().some((set) => set.id === targetId)) return false
    const next = categoryUpdate(sets().map((set) => set.id === targetId ? globalAgentPresetSetMembershipChange(set, resource, true) : set))
    return next ? save(next) : false
  }
  const presetDrop = async (categoryKey: Category, setId: string) => {
    const doc = document.get()
    if (!doc || !doc.categories[categoryKey].sets.some((set) => set.id === setId) || !activePreset()) return false
    const field = fields[categoryKey]
    if (activePreset()![field].includes(setId)) return false
    await presetMembershipChange(field, setId, true)
    return !error.get()
  }
  const presetMemberDropOutside = async (value: string) => {
    const [categoryKey, setId] = value.split(":") as [Category, string]
    if (!fields[categoryKey] || !activePreset()?.[fields[categoryKey]].includes(setId)) return
    await presetMembershipChange(fields[categoryKey], setId, false)
  }
  const dragListAttach = (element: HTMLElement, kind: "catalog" | "set" | "preset", id: string, values: () => string[]) => {
    let disposed = false
    // Solid invokes the parent ref before its <For> children are inserted. FormKit
    // maps children to values immediately, so attach after that initial render.
    queueMicrotask(() => {
      if (disposed) return
      lists.set(element, { kind, id })
      dragAndDrop<string>({ parent: element, getValues: values, setValues: () => {}, config: {
        group: category ? `global-${category}-members` : "global-preset-sets",
        sortable: false,
        draggable: (child) => child.hasAttribute("data-drag-member"),
        dropZoneParentClass: "outline-2 outline-dashed outline-accent",
        onDragstart: () => { transferred = false; lastPoint = undefined; globalThis.document?.addEventListener("dragover", pointTrack); globalThis.document?.addEventListener("pointermove", pointTrack) },
        onTransfer: (data) => {
        // FormKit calls onTransfer for both parents. Only the source handles it.
        if (data.sourceParent.el !== element) return
        transferred = true
        const source = lists.get(data.sourceParent.el)
        const target = lists.get(data.targetParent.el)
        const value = data.draggedNodes[0]?.data.value
        if (!source || !target || !value) return
        if (category && target.kind === "set") {
          if (source.kind === "catalog") void catalogAssign(value, target.id)
          if (source.kind === "set") transferRequest(value, source.id, target.id)
        }
        if (!category && (source.kind === "catalog" || source.kind === "preset") && target.kind === "preset") {
          const [categoryKey, setId] = value.split(":") as [Category, string]
          void presetDrop(categoryKey, setId)
        }
        },
        onDragend: (data) => {
        globalThis.document?.removeEventListener("dragover", pointTrack)
        globalThis.document?.removeEventListener("pointermove", pointTrack)
        // FormKit reports the current parent here, which can be a different
        // preset drop list after the chip has crossed another list.
        const source = lists.get("initialParent" in data.state ? data.state.initialParent.el : data.parent.el)
        if (category && source?.kind === "set" && !transferred && lastPoint) {
          const { x, y } = lastPoint
          const hovered = documentAtPoint(x, y)
          if (hovered && ![...lists.keys()].some((list) => list.contains(hovered))) void memberDropOutside(data.draggedNode.data.value, source.id)
        }
        // A transfer into a checkbox/drop list can happen on the way to an
        // outside drop. Only the final pointer location decides removal.
        if (!category && source?.kind === "preset" && lastPoint) {
          const hovered = documentAtPoint(lastPoint.x, lastPoint.y)
          if (hovered && ![...lists.keys()].some((list) => list.contains(hovered))) void presetMemberDropOutside(data.draggedNode.data.value)
        }
        transferred = false
        lastPoint = undefined
        },
      } })
    })
    onCleanup(() => { disposed = true; globalThis.document?.removeEventListener("dragover", pointTrack); globalThis.document?.removeEventListener("pointermove", pointTrack); tearDown(element); parents.delete(element); lists.delete(element) })
  }
  const documentAtPoint = (x: number, y: number) => globalThis.document?.elementFromPoint(x, y)
  const resourceAdd = async () => {
    const value = newResource.get().trim()
    if (!value || (category === "subagents" && (!agentsLoaded.get() || !names.get().includes(value)))) return
    if (await membershipChange(value, true)) newResource.set("")
  }
  const presetMembershipChange = async (field: Field, value: string, enabled: boolean) => {
    const doc = document.get()
    const id = selectedId.get()
    if (!doc || !id) return
    if (draft.get()?.id === id) { error.set("Save the preset fields before assigning resources."); return }
    if (field === "subagentNames" && enabled && (!agentsLoaded.get() || !names.get().includes(value))) {
      error.set("Choose an available global subagent.")
      return
    }
    await save({ ...doc, presets: presets().map((preset) => preset.id === id ? {
      ...preset, [field]: enabled ? [...new Set([...preset[field], value])] : preset[field].filter((item) => item !== value),
    } : preset) })
  }
  const individualAdd = async () => {
    const value = newResource.get().trim()
    if (!value || !agentsLoaded.get() || !names.get().includes(value)) return
    await presetMembershipChange("subagentNames", value, true)
    if (!error.get()) newResource.set("")
  }

  onMount(() => { void load() })
  return {
    category, document: () => document.get(), names: () => names.get(), availableNames, selectedNames,
    agentsLoaded: () => agentsLoaded.get(),
     executionAgents: () => executionAgents.get(), modelOptions, catalogError: () => catalogError.get(), fieldsValid, isDraft: () => draft.get()?.id === selectedId.get(),
     modelBlockedReason: () => !executionAgents.get().includes(executionAgentId.get()) ? "Choose an available execution agent." : !selectedAgent()?.provider ? "This agent has no available provider." : modelOptions().length === 0 ? `No selectable models are available for ${selectedAgent()?.provider}. ${catalogError.get()}` : modelId.get() && !modelOptions().some((model) => model.id === modelId.get()) ? "The selected model is unavailable for this agent's provider." : "",
    sets, presets, activeSet, activePreset, individualNames, selectedId: () => selectedId.get(),
    name: () => name.get(), executionAgentId: () => executionAgentId.get(), modelId: () => modelId.get(),
    newResource: () => newResource.get(), busy: () => busy.get(), loading: () => loading.get(),
    error: () => error.get(), message: () => message.get(),
    nameInput: (event: InputEvent & { currentTarget: HTMLInputElement }) => name.set(event.currentTarget.value),
     agentInput: (event: Event & { currentTarget: HTMLSelectElement }) => { executionAgentId.set(event.currentTarget.value); modelId.set(defaultModel(event.currentTarget.value)) },
    modelInput: (event: Event & { currentTarget: HTMLSelectElement }) => modelId.set(event.currentTarget.value),
    resourceInput: (event: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }) => newResource.set(event.currentTarget.value),
    select, load, entryCreate, entryRename, entryDelete, defaultChoose, membershipChange, resourceAdd,
    presetMembershipChange, individualAdd, pendingMove: () => pendingMove.get(), transferRequest, transferConfirm, transferCancel,
    memberDropOutside, catalogAssign, presetDrop, presetMemberDropOutside, dragListAttach,
  }
}
