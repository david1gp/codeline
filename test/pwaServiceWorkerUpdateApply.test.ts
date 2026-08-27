import { expect, test } from "bun:test"
import {
  type PwaServiceWorkerUpdatePort,
  pwaServiceWorkerSkipWaitingMessage,
  pwaServiceWorkerUpdateApply,
} from "../src/ui/pwa/pwaServiceWorkerUpdateApply.js"

function portCreate(options: { waiting: boolean }) {
  const listeners = new Set<() => void>()
  const messages: unknown[] = []
  let reloads = 0

  const port: PwaServiceWorkerUpdatePort = {
    controllerChanged: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reload: () => {
      reloads += 1
    },
    waiting: () => (options.waiting ? { postMessage: (message: unknown) => void messages.push(message) } : undefined),
  }

  return {
    port,
    messages,
    listenerCount: () => listeners.size,
    reloads: () => reloads,
    emitControllerChange: () => {
      for (const listener of [...listeners]) listener()
    },
  }
}

test("activates the waiting worker instead of reloading immediately", () => {
  const harness = portCreate({ waiting: true })

  pwaServiceWorkerUpdateApply(harness.port)

  expect(harness.messages).toEqual([{ type: pwaServiceWorkerSkipWaitingMessage }])
  expect(harness.reloads()).toBe(0)
})

test("reloads once when the new worker takes control", () => {
  const harness = portCreate({ waiting: true })

  pwaServiceWorkerUpdateApply(harness.port)
  harness.emitControllerChange()

  expect(harness.reloads()).toBe(1)
})

test("does not reload again on repeated controller changes", () => {
  const harness = portCreate({ waiting: true })

  pwaServiceWorkerUpdateApply(harness.port)
  harness.emitControllerChange()
  harness.emitControllerChange()
  harness.emitControllerChange()

  expect(harness.reloads()).toBe(1)
})

test("detaches the controller listener after reloading", () => {
  const harness = portCreate({ waiting: true })

  pwaServiceWorkerUpdateApply(harness.port)
  expect(harness.listenerCount()).toBe(1)

  harness.emitControllerChange()
  expect(harness.listenerCount()).toBe(0)
})

test("reloads directly when no worker is waiting", () => {
  const harness = portCreate({ waiting: false })

  pwaServiceWorkerUpdateApply(harness.port)

  expect(harness.reloads()).toBe(1)
  expect(harness.messages).toEqual([])
  expect(harness.listenerCount()).toBe(0)
})
