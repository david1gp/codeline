import { expect, test } from "bun:test"
import { streamSseFrameRead } from "../src/stream/api/streamSseFrameRead.js"

function readableCreate(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function textChunksCreate(text: string, splitAt: readonly number[]): readonly Uint8Array[] {
  const bytes = new TextEncoder().encode(text)
  const offsets = [0, ...splitAt, bytes.byteLength]
  return offsets.slice(0, -1).map((offset, index) => bytes.slice(offset, offsets[index + 1]))
}

async function collect(readable: ReadableStream<Uint8Array>) {
  const results = []
  for await (const result of streamSseFrameRead(readable)) results.push(result)
  return results
}

test("reads named SSE event, id, and multiline data across split UTF-8 chunks", async () => {
  const text = ": ignored\r\nid: cursor-1\r\nevent: selected-entry\r\ndata: café\r\ndata: second line\r\n\r\n"
  const results = await collect(readableCreate(textChunksCreate(text, [1, 2, 7, 14, 25, 34, 44])))

  expect(results).toEqual([
    { success: true, data: { data: "café\nsecond line", event: "selected-entry", id: "cursor-1" } },
  ])
})

test("retains the last event id, defaults unnamed events, and completes after stream closure", async () => {
  const readable = readableCreate(
    textChunksCreate("id: cursor-1\ndata: first\n\nevent: next\ndata: second\n\n", [3, 17, 28]),
  )
  const results = await collect(readable)

  expect(results).toEqual([
    { success: true, data: { data: "first", event: "message", id: "cursor-1" } },
    { success: true, data: { data: "second", event: "next", id: "cursor-1" } },
  ])
  expect(readable.locked).toBe(false)
})

test("releases a pending stream when the consumer closes the async generator", async () => {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: pending\n\n"))
    },
  })
  const iterator = streamSseFrameRead(readable)

  expect((await iterator.next()).done).toBe(false)
  await iterator.return(undefined)

  expect(readable.locked).toBe(false)
})

test("returns a deterministic error for invalid UTF-8", async () => {
  const results = await collect(readableCreate([new Uint8Array([0xc3, 0x28])]))

  expect(results).toEqual([
    { success: false, op: "streamSseFrameRead", errorMessage: "The SSE response contains invalid UTF-8." },
  ])
})

test("returns a deterministic error when the chunk source fails", async () => {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("source failed"))
    },
  })

  expect(await collect(readable)).toEqual([
    { success: false, op: "streamSseFrameRead", errorMessage: "The SSE response could not be read." },
  ])
})

test("returns a deterministic error for an unterminated SSE frame", async () => {
  const results = await collect(readableCreate([new TextEncoder().encode("event: selected-entry\ndata: partial\n")]))

  expect(results).toEqual([
    { success: false, op: "streamSseFrameRead", errorMessage: "The SSE response ended with an incomplete frame." },
  ])
})
