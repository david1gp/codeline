import { expect, test } from "bun:test"
import { demoSessionChatStateCreate } from "../src/ui/demo/demoSessionChatStateCreate.js"

test("demo generating chat stops locally and clears its in-flight response", () => {
  const state = demoSessionChatStateCreate(() => "streaming")

  expect(state.isBusy()).toBe(true)
  expect(state.isThinking()).toBe(true)
  expect(state.pendingMessages()).toHaveLength(2)
  expect(state.recoveryStatus()).toBe("streaming")

  state.stopHandle()

  expect(state.isBusy()).toBe(false)
  expect(state.isThinking()).toBe(false)
  expect(state.isAborted()).toBe(true)
  expect(state.pendingMessages()).toHaveLength(0)
  expect(state.recoveryStatus()).toBe("idle")
})
