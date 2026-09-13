import { createHotkeys } from "@tanstack/solid-hotkeys"
import { createEffect } from "solid-js"
import type { SearchablePickerItem } from "./searchablePickerItem.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SearchablePickerNavigationKey = "ArrowDown" | "ArrowUp" | "End" | "Home"

type SearchablePickerStateOptions<T extends SearchablePickerItem> = {
  active: () => boolean
  idPrefix: () => string
  items: () => readonly T[]
  onSelect: (item: T) => void
  selectedId: () => string | null
}

/** Search, active-descendant, and keyboard behavior for an app-owned listbox picker. */
export function searchablePickerStateCreate<T extends SearchablePickerItem>(options: SearchablePickerStateOptions<T>) {
  const inputElement = signalObjectCreate<HTMLInputElement | null>(null)
  const query = signalObjectCreate("")
  const highlightedIdOverride = signalObjectCreate<string | null>(null)
  let wasActive = false

  const filteredItems = (): readonly T[] => {
    const normalizedQuery = query.get().trim().toLocaleLowerCase()
    if (normalizedQuery.length === 0) return options.items()

    return options
      .items()
      .filter((item) =>
        [item.label, item.description ?? "", ...(item.keywords ?? [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
  }

  const enabledItems = (): readonly T[] => filteredItems().filter((item) => item.disabled !== true)

  const highlightedItem = (): T | undefined => {
    const enabled = enabledItems()
    const override = highlightedIdOverride.get()
    if (override !== null) {
      const match = enabled.find((item) => item.id === override)
      if (match !== undefined) return match
    }

    const selected = options.selectedId()
    if (selected !== null) {
      const match = enabled.find((item) => item.id === selected)
      if (match !== undefined) return match
    }

    return enabled[0]
  }

  const optionId = (itemId: string): string => {
    const index = filteredItems().findIndex((item) => item.id === itemId)
    return `${options.idPrefix()}-option-${Math.max(index, 0)}`
  }

  const highlightedScroll = (item: T | undefined): void => {
    if (item === undefined || typeof document === "undefined") return
    queueMicrotask(() => document.getElementById(optionId(item.id))?.scrollIntoView({ block: "nearest" }))
  }

  const navigationMove = (key: SearchablePickerNavigationKey): void => {
    const enabled = enabledItems()
    if (enabled.length === 0) return

    const current = highlightedItem()
    const currentIndex = current === undefined ? -1 : enabled.findIndex((item) => item.id === current.id)
    let nextIndex = 0
    if (key === "ArrowDown") nextIndex = (currentIndex + 1) % enabled.length
    if (key === "ArrowUp") nextIndex = (currentIndex - 1 + enabled.length) % enabled.length
    if (key === "End") nextIndex = enabled.length - 1

    const next = enabled[nextIndex]
    if (next === undefined) return
    highlightedIdOverride.set(next.id)
    highlightedScroll(next)
  }

  const highlightedSelect = (): void => {
    const item = highlightedItem()
    if (item === undefined || item.disabled === true) return
    options.onSelect(item)
  }

  createEffect(() => {
    const active = options.active()
    if (active && !wasActive) {
      query.set("")
      highlightedIdOverride.set(null)
      queueMicrotask(() => inputElement.get()?.focus())
    }
    wasActive = active
  })

  createHotkeys(
    () => [
      { hotkey: "ArrowDown" as const, callback: () => navigationMove("ArrowDown") },
      { hotkey: "ArrowUp" as const, callback: () => navigationMove("ArrowUp") },
      { hotkey: "Home" as const, callback: () => navigationMove("Home") },
      { hotkey: "End" as const, callback: () => navigationMove("End") },
      { hotkey: "Enter" as const, callback: highlightedSelect },
    ],
    () => ({
      enabled: options.active(),
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true,
      target: inputElement.get(),
    }),
  )

  return {
    activeDescendant: () => {
      const highlighted = highlightedItem()
      return highlighted === undefined ? undefined : optionId(highlighted.id)
    },
    filteredItems,
    highlightedId: () => highlightedItem()?.id ?? null,
    highlightedSelect,
    inputRef: (element: HTMLInputElement) => inputElement.set(element),
    itemHighlight: (item: T) => {
      if (item.disabled === true) return
      highlightedIdOverride.set(item.id)
    },
    itemSelect: (item: T) => {
      if (item.disabled === true) return
      highlightedIdOverride.set(item.id)
      options.onSelect(item)
    },
    listboxId: () => `${options.idPrefix()}-listbox`,
    navigationMove,
    optionId,
    query: query.get,
    queryInput: (event: InputEvent & { currentTarget: HTMLInputElement }) => {
      query.set(event.currentTarget.value)
      highlightedIdOverride.set(null)
      highlightedScroll(highlightedItem())
    },
  }
}
