import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { searchablePickerStateCreate } = await import("../src/ui/searchablePickerStateCreate.js")
const pickerSource = await Bun.file(new URL("../src/ui/SearchablePicker.tsx", import.meta.url)).text()

const items = [
  { description: "/workspace/alpha", id: "alpha", label: "Alpha" },
  { description: "/workspace/beta", disabled: true, id: "beta", label: "Beta" },
  { description: "/other/gamma", id: "gamma", label: "Gamma", keywords: ["tools"] },
]

function pickerCreate(selectedId: string | null = null) {
  const selections: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    selections,
    state: searchablePickerStateCreate({
      active: () => false,
      idPrefix: () => "test-picker",
      items: () => items,
      onSelect: (item) => selections.push(item.id),
      selectedId: () => selectedId,
    }),
  }))
  return root
}

test("search matches labels, descriptions, and keywords and reports empty results", () => {
  const picker = pickerCreate()

  picker.state.queryInput({ currentTarget: { value: "workspace/alpha" } } as InputEvent & {
    currentTarget: HTMLInputElement
  })
  expect(picker.state.filteredItems().map((item) => item.id)).toEqual(["alpha"])

  picker.state.queryInput({ currentTarget: { value: "tools" } } as InputEvent & {
    currentTarget: HTMLInputElement
  })
  expect(picker.state.filteredItems().map((item) => item.id)).toEqual(["gamma"])

  picker.state.queryInput({ currentTarget: { value: "missing" } } as InputEvent & {
    currentTarget: HTMLInputElement
  })
  expect(picker.state.filteredItems()).toEqual([])
  expect(picker.state.highlightedId()).toBeNull()
  picker.dispose()
})

test("arrow and boundary navigation wraps while skipping disabled entries", () => {
  const picker = pickerCreate("alpha")

  expect(picker.state.highlightedId()).toBe("alpha")
  picker.state.navigationMove("ArrowDown")
  expect(picker.state.highlightedId()).toBe("gamma")
  picker.state.navigationMove("ArrowDown")
  expect(picker.state.highlightedId()).toBe("alpha")
  picker.state.navigationMove("ArrowUp")
  expect(picker.state.highlightedId()).toBe("gamma")
  picker.state.navigationMove("Home")
  expect(picker.state.highlightedId()).toBe("alpha")
  picker.state.navigationMove("End")
  expect(picker.state.highlightedId()).toBe("gamma")
  picker.dispose()
})

test("selection ignores disabled entries and selects enabled entries", () => {
  const picker = pickerCreate()

  picker.state.itemSelect(items[1]!)
  expect(picker.selections).toEqual([])
  picker.state.navigationMove("End")
  picker.state.highlightedSelect()
  expect(picker.selections).toEqual(["gamma"])
  picker.dispose()
})

test("a disabled-only search result cannot be highlighted or selected", () => {
  const picker = pickerCreate()

  picker.state.queryInput({ currentTarget: { value: "beta" } } as InputEvent & {
    currentTarget: HTMLInputElement
  })
  expect(picker.state.filteredItems().map((item) => item.id)).toEqual(["beta"])
  expect(picker.state.highlightedId()).toBeNull()
  picker.state.navigationMove("ArrowDown")
  picker.state.highlightedSelect()
  expect(picker.selections).toEqual([])
  picker.dispose()
})

test("the picker exposes its actual active state through aria-expanded", () => {
  expect(pickerSource).toContain("aria-expanded={props.active !== false}")
  expect(pickerSource).not.toContain('aria-expanded="true"')
})
