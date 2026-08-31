import { expect, test } from "bun:test"

test("bounded semantic history remains visible when the execution stream mode is selected", async () => {
  const source = await Bun.file(new URL("../src/ui/SelectedSession.tsx", import.meta.url)).text()
  const semanticHistory = source.indexOf("<SessionSemanticHistory")
  const streamBranch = source.indexOf('<Show when={props.state.displayMode.mode() === "stream"}>')

  expect(semanticHistory).toBeGreaterThanOrEqual(0)
  expect(streamBranch).toBeGreaterThanOrEqual(0)
  expect(streamBranch).toBeGreaterThan(semanticHistory)
})
