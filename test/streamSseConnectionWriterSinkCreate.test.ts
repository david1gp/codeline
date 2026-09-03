import { expect, test } from "bun:test"
import { streamSseConnectionWriterSinkCreate } from "../src/stream/actions/streamSseConnectionWriterSinkCreate.js"

test("forwards sink close and abort failures without suppressing them", async () => {
  const closeError = new Error("close failed")
  const abortError = new Error("abort failed")
  const abortReasons: unknown[] = []
  const outputWriter = {
    abort: (reason?: unknown) => {
      abortReasons.push(reason)
      return Promise.reject(abortError)
    },
    close: () => Promise.reject(closeError),
    write: () => Promise.resolve(),
  } as unknown as WritableStreamDefaultWriter<Uint8Array>
  const sink = streamSseConnectionWriterSinkCreate(outputWriter)

  await expect(sink.close()).rejects.toBe(closeError)
  await expect(sink.abort("request-aborted")).rejects.toBe(abortError)
  expect(abortReasons).toEqual(["request-aborted"])
})
