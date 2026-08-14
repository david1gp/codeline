import { expect, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import { chatComposerStop } from "../src/ui/chatComposerStop.js"

test("composer stop commits cancellation before invoking the local stop and ignores duplicates", async () => {
  const order: string[] = []
  let releaseCancellation: () => void = () => undefined
  const cancellationGate = new Promise<void>((resolve) => {
    releaseCancellation = resolve
  })

  const cancellation = async () => {
    order.push("durable-cancel-start")
    await cancellationGate
    order.push("durable-cancel-committed")
    return createResult({})
  }
  const options = {
    cancellation,
    clientRunId: "client-run",
    isBusy: true,
    isStopping: false,
    localStop: () => order.push("local-stop"),
    onError: (message: string) => order.push(`error:${message}`),
    onFinish: () => order.push("finish"),
    onStart: () => order.push("start"),
  }

  const first = chatComposerStop(options)
  const duplicate = chatComposerStop({ ...options, isStopping: true })
  await Promise.resolve()
  expect(order).toEqual(["start", "durable-cancel-start"])

  releaseCancellation()
  await first
  await duplicate
  expect(order).toEqual(["start", "durable-cancel-start", "durable-cancel-committed", "local-stop", "finish"])
})

test("composer stop presents cancellation failures without invoking the local stop", async () => {
  const order: string[] = []
  await chatComposerStop({
    cancellation: async () => createResultError("runCancelCommand", "Cancellation failed."),
    clientRunId: "client-run",
    isBusy: true,
    isStopping: false,
    localStop: () => order.push("local-stop"),
    onError: (message) => order.push(`error:${message}`),
    onFinish: () => order.push("finish"),
    onStart: () => order.push("start"),
  })

  expect(order).toEqual(["start", "error:Cancellation failed.", "finish"])
})
