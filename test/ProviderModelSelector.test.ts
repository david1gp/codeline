import { expect, test } from "bun:test"

test("provider model selector renders non-selectable provider groups with selectable models beneath", async () => {
  const component = await Bun.file(new URL("../src/providers/ui/ProviderModelSelector.tsx", import.meta.url)).text()

  expect(component).toContain("<optgroup label={provider.name}>")
  expect(component).toContain("<option value={model.value}>{model.name}</option>")
  expect(component).toContain("<For each={props.state.groups()}>")
  expect(component).toContain("<option>Loading models...</option>")
  expect(component).toContain("Loading available models.")
  expect(component).not.toContain("starting a conversation")
  expect(component).not.toContain("choosing a conversation")
  expect(component).not.toContain("Select a conversation")
  expect(component).not.toContain("<option disabled")
  expect(component).not.toContain("effortLevels")
})
