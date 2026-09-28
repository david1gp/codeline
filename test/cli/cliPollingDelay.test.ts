import { describe, expect, it } from "bun:test"
import { cliPollingDelay } from "../../src/cli/cliPollingDelay.js"

describe("CLI polling delay", () => {
  it("cleans its abort listener after the timer completes", async () => {
    const controller = new AbortController()
    let listeners = 0
    const add = controller.signal.addEventListener.bind(controller.signal)
    const remove = controller.signal.removeEventListener.bind(controller.signal)
    controller.signal.addEventListener = (...args: Parameters<typeof add>) => {
      listeners += 1
      add(...args)
    }
    controller.signal.removeEventListener = (...args: Parameters<typeof remove>) => {
      listeners -= 1
      remove(...args)
    }
    await cliPollingDelay(controller.signal, 0)
    expect(listeners).toBe(0)
  })

  it("interrupts a pending delay and removes its listener", async () => {
    const controller = new AbortController()
    const pending = cliPollingDelay(controller.signal, 60_000)
    controller.abort()
    await pending
    expect(controller.signal.aborted).toBe(true)
    await cliPollingDelay(controller.signal, 60_000)
  })
})
