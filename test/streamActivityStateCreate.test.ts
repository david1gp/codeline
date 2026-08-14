import { expect, mock, test } from "bun:test"

mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(initialValue: T) => {
    let value = initialValue
    return {
      get: () => value,
      set: (nextValue: T) => {
        value = nextValue
      },
    }
  },
}))

const { streamActivityStateCreate } = await import("../src/ui/streamActivityStateCreate.js")

test("stream activity derives attempt count, thinking, and retry failures from transport chunks", () => {
  const state = streamActivityStateCreate()
  state.chunkObserve({ type: "RUN_STARTED" })
  state.chunkObserve({ type: "REASONING_START" })
  expect(state.isThinking()).toBe(true)
  state.chunkObserve({ type: "REASONING_END" })
  state.chunkObserve({ code: "provider_timeout", message: "Timed out.", type: "RUN_ERROR" } as never)
  state.chunkObserve({ type: "RUN_STARTED" })
  state.chunkObserve({ code: "chat_aborted", message: "Stopped.", type: "RUN_ERROR" } as never)

  expect(state.attemptCount()).toBe(2)
  expect(state.failures()).toEqual([
    { code: "provider_timeout", message: "Timed out." },
    { code: "chat_aborted", message: "Stopped." },
  ])
  expect(state.isAborted()).toBe(true)

  state.turnReset()
  expect(state.attemptCount()).toBe(0)
  expect(state.failures()).toEqual([])
  expect(state.isAborted()).toBe(false)
})
