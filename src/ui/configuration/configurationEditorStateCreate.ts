import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { createEffect, onCleanup } from "solid-js"
import * as v from "valibot"
import { configurationEntriesSchema } from "./configurationEntriesSchema.js"
import type { ConfigurationEntry } from "./configurationEntrySchema.js"
import { configurationFixtures } from "./configurationFixtures.js"
import { configurationSectionDetailsResolve } from "./configurationSectionDetailsResolve.js"
import type { ConfigurationSection } from "./configurationSectionSchema.js"
type TextInputEvent = InputEvent & { currentTarget: HTMLInputElement }
type TextareaInputEvent = InputEvent & { currentTarget: HTMLTextAreaElement }
function entriesInitial(section: ConfigurationSection, storageKey: string): ConfigurationEntry[] {
  const fallback = () => configurationFixtures[section].map((entry) => ({ ...entry }))
  if (typeof localStorage === "undefined") return fallback()
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === null) return fallback()
    const parsed = v.safeParse(configurationEntriesSchema, JSON.parse(stored))
    return parsed.success ? parsed.output : fallback()
  } catch {
    return fallback()
  }
}
function idleSchedule(callback: () => void) {
  if (typeof requestIdleCallback === "function") return { id: requestIdleCallback(callback), kind: "idle" as const }
  return { id: window.setTimeout(callback, 0), kind: "timeout" as const }
}
type IdleHandle = ReturnType<typeof idleSchedule>
function idleCancel(handle: IdleHandle | undefined) {
  if (handle === undefined) return
  if (handle.kind === "idle") {
    cancelIdleCallback(handle.id)
    return
  }
  clearTimeout(handle.id)
}
export function configurationEditorStateCreate(section: ConfigurationSection, storageKey: string) {
  const details = configurationSectionDetailsResolve(section)
  const entries = createSignalObject<ConfigurationEntry[]>(entriesInitial(section, storageKey))
  const selectedId = createSignalObject<string | undefined>(entries.get()[0]?.id)
  const storageAvailable = createSignalObject(typeof localStorage !== "undefined")
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let idleHandle: IdleHandle | undefined
  const persist = (value: ConfigurationEntry[]) => {
    if (typeof localStorage === "undefined") return
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
      storageAvailable.set(true)
    } catch {
      storageAvailable.set(false)
    }
  }
  const flush = () => {
    clearTimeout(saveTimer)
    saveTimer = undefined
    idleCancel(idleHandle)
    idleHandle = undefined
    persist(entries.get())
  }
  const page = typeof window === "undefined" ? undefined : window
  page?.addEventListener("pagehide", flush)
  createEffect(() => {
    const value = entries.get()
    if (typeof localStorage === "undefined") return
    clearTimeout(saveTimer)
    saveTimer = undefined
    idleCancel(idleHandle)
    idleHandle = undefined
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      idleHandle = idleSchedule(() => {
        idleHandle = undefined
        persist(value)
      })
    }, 250)
  })
  onCleanup(() => {
    flush()
    page?.removeEventListener("pagehide", flush)
  })
  const activeEntry = () => entries.get().find((entry) => entry.id === selectedId.get())
  const entryUpdate = (update: Partial<ConfigurationEntry>) => {
    const id = selectedId.get()
    entries.set(entries.get().map((entry) => (entry.id === id ? { ...entry, ...update } : entry)))
  }
  const entryCreate = () => {
    const id = `${section}-${Date.now()}-${entries.get().length + 1}`
    entries.set([
      ...entries.get(),
      { content: "", description: "", enabled: true, id, name: `New ${details.itemLabel}` },
    ])
    selectedId.set(id)
  }
  const entryDelete = () => {
    const remaining = entries.get().filter((entry) => entry.id !== selectedId.get())
    entries.set(remaining)
    selectedId.set(remaining[0]?.id)
  }
  const entriesReset = () => {
    const reset = configurationFixtures[section].map((entry) => ({ ...entry }))
    entries.set(reset)
    selectedId.set(reset[0]?.id)
  }
  return {
    activeEntry,
    contentInput: (event: TextareaInputEvent) => entryUpdate({ content: event.currentTarget.value }),
    descriptionInput: (event: TextareaInputEvent) => entryUpdate({ description: event.currentTarget.value }),
    details,
    enabledChange: (enabled: boolean) => entryUpdate({ enabled }),
    entries: () => entries.get(),
    entriesReset,
    entryCreate,
    entryDelete,
    entrySelect: (id: string) => selectedId.set(id),
    nameInput: (event: TextInputEvent) => entryUpdate({ name: event.currentTarget.value }),
    section,
    selectedId: () => selectedId.get(),
    storageMessage: () =>
      storageAvailable.get()
        ? "Stored locally in this browser. These drafts do not change runtime configuration."
        : "Browser storage is unavailable. Changes last only for this page.",
  }
}
