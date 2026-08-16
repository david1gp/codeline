import { expect, test } from "bun:test"

test("stream mode renders before finalized-message errors so available stream data remains visible", async () => {
  const source = await Bun.file(new URL("../src/ui/SelectedSession.tsx", import.meta.url)).text()
  const streamBranch = source.indexOf('<Match when={props.state.displayMode.mode() === "stream"}>')
  const messageErrorBranch = source.indexOf("<Match when={props.state.isMessagesError()}>")

  expect(streamBranch).toBeGreaterThanOrEqual(0)
  expect(messageErrorBranch).toBeGreaterThan(streamBranch)
})
