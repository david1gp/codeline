import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { onCleanup, onMount } from "solid-js"
import { globalResourceClientCreate, type GlobalResourceKind } from "../client/globalResourceClientCreate.js"

type Client = ReturnType<typeof globalResourceClientCreate>

export function globalResourceEditorStateCreate(
  kind: GlobalResourceKind,
  client: Client = globalResourceClientCreate(kind),
) {
  const names = createSignalObject<string[]>([])
  const selected = createSignalObject<string | undefined>(undefined)
  const name = createSignalObject("")
  const content = createSignalObject("")
  const original = createSignalObject("")
  const loading = createSignalObject(false)
  const listing = createSignalObject(false)
  const busy = createSignalObject(false)
  const error = createSignalObject("")
  const message = createSignalObject("")
  let generation = 0
  let controller: AbortController | undefined

  const dirty = () =>
    selected.get() === undefined ? name.get().length > 0 || content.get().length > 0 : content.get() !== original.get()
  const discardConfirmed = () =>
    !dirty() || (typeof window !== "undefined" && window.confirm("Discard unsaved changes?"))
  const entrySelect = async (next: string, force = false) => {
    if (busy.get() || (!force && !discardConfirmed())) return
    const request = ++generation
    controller?.abort()
    controller = new AbortController()
    listing.set(false)
    selected.set(next)
    name.set(next)
    content.set("")
    original.set("")
    loading.set(true)
    error.set("")
    message.set("")
    const result = await client.get(next, controller.signal)
    if (generation !== request) return
    loading.set(false)
    if (!result.success) {
      error.set(result.errorMessage)
      return
    }
    content.set(result.data.content)
    original.set(result.data.content)
  }
  const listLoad = async () => {
    if (busy.get() || dirty()) return
    const request = ++generation
    listing.set(true)
    error.set("")
    const result = await client.list()
    if (generation !== request) return
    listing.set(false)
    if (dirty()) return
    if (!result.success) {
      error.set(result.errorMessage)
      return
    }
    const listed = result.data[kind] ?? []
    names.set(listed)
    if (listed.length > 0) await entrySelect(listed[0]!, true)
  }
  const entryNew = () => {
    if (busy.get() || !discardConfirmed()) return
    ++generation
    listing.set(false)
    controller?.abort()
    selected.set(undefined)
    name.set("")
    content.set("")
    original.set("")
    loading.set(false)
    error.set("")
    message.set("")
  }
  const entrySave = async () => {
    if (busy.get() || loading.get()) return
    const current = selected.get()
    const target = current ?? name.get().trim()
    if (!target || !content.get().trim()) {
      error.set("Enter a name and source content before saving.")
      return
    }
    busy.set(true)
    error.set("")
    message.set("")
    const savedContent = content.get()
    const result =
      current === undefined ? await client.create(target, savedContent) : await client.update(current, savedContent)
    busy.set(false)
    if (!result.success) {
      error.set(result.errorMessage)
      return
    }
    selected.set(result.data.name)
    name.set(result.data.name)
    content.set(result.data.content)
    original.set(result.data.content)
    if (!names.get().includes(result.data.name)) names.set([...names.get(), result.data.name].sort())
    message.set(current === undefined ? "Created global source file." : "Saved global source file.")
  }
  const entryDelete = async () => {
    const current = selected.get()
    if (
      !current ||
      busy.get() ||
      loading.get() ||
      (typeof window !== "undefined" && !window.confirm(`Delete ${current}? This removes its global source file.`))
    )
      return
    busy.set(true)
    error.set("")
    const result = await client.delete(current)
    busy.set(false)
    if (!result.success) {
      error.set(result.errorMessage)
      return
    }
    const remaining = names.get().filter((item) => item !== current)
    names.set(remaining)
    ++generation
    controller?.abort()
    selected.set(undefined)
    name.set("")
    content.set("")
    original.set("")
    message.set("Deleted global source file.")
    if (remaining[0]) await entrySelect(remaining[0], true)
  }

  onMount(() => {
    void listLoad()
  })
  onCleanup(() => {
    ++generation
    controller?.abort()
  })
  return {
    kind,
    names: () => names.get(),
    selected: () => selected.get(),
    name: () => name.get(),
    content: () => content.get(),
    loading: () => loading.get(),
    listing: () => listing.get(),
    busy: () => busy.get(),
    dirty,
    error: () => error.get(),
    message: () => message.get(),
    nameInput: (event: InputEvent & { currentTarget: HTMLInputElement }) => name.set(event.currentTarget.value),
    contentInput: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) =>
      content.set(event.currentTarget.value),
    entrySelect,
    entryNew,
    entrySave,
    entryDelete,
    listLoad,
  }
}
