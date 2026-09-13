import { expect, test } from "bun:test"

const selectorSource = await Bun.file(new URL("../src/ui/FilesProjectSelector.tsx", import.meta.url)).text()

test("the files project selector reuses the shared searchable picker", () => {
  expect(selectorSource).toContain('from "./SearchablePicker.js"')
  expect(selectorSource).toContain("filesProjectPickerItemsDerive(state.projects())")
  expect(selectorSource).toContain("onSelect={(project) => state.projectSelect(project.id)}")
  expect(selectorSource).toContain("selectedId={state.selectedProject()?.id ?? null}")
  expect(selectorSource).toContain("projectFolderIconSelect(false)")
})

test("the files selector preserves loading, error, retry, empty, and truncation states", () => {
  expect(selectorSource).toContain('state.status() === "loading"')
  expect(selectorSource).toContain('state.status() === "error"')
  expect(selectorSource).toContain("onClick={state.retry}")
  expect(selectorSource).toContain("No registered projects available.")
  expect(selectorSource).toContain("state.truncated()")
})
