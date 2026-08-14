import { EventType, type StreamChunk } from "@tanstack/ai"

type SessionChatSseStreamCreateOptions = {
  requestSignal?: AbortSignal
  getId?: (chunk: StreamChunk, index: number) => string | undefined
}

function sessionChatSseErrorEncode(error: unknown): Uint8Array {
  const message = error instanceof Error ? error.message : "The chat stream failed."
  return new TextEncoder().encode(
    `data: ${JSON.stringify({ message, timestamp: Date.now(), type: EventType.RUN_ERROR })}\n\n`,
  )
}

export function sessionChatSseStreamCreate(
  stream: AsyncIterable<StreamChunk>,
  options: SessionChatSseStreamCreateOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let detached = options.requestSignal?.aborted ?? false
  let readerCancelled = false

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onRequestAbort = () => {
        detached = true
      }
      options.requestSignal?.addEventListener("abort", onRequestAbort, { once: true })

      void (async () => {
        const iterator = stream[Symbol.asyncIterator]()
        let index = 0
        let completed = false

        try {
          while (true) {
            const result = await iterator.next()
            if (result.done) {
              completed = true
              break
            }
            if (!detached) {
              const id = options.getId?.(result.value, index)
              const idLine = id === undefined ? "" : `id: ${id.replace(/[\r\n]/g, "")}\n`
              controller.enqueue(encoder.encode(`${idLine}data: ${JSON.stringify(result.value)}\n\n`))
            }
            index += 1
          }
        } catch (error) {
          if (!detached) controller.enqueue(sessionChatSseErrorEncode(error))
        } finally {
          options.requestSignal?.removeEventListener("abort", onRequestAbort)
          if (completed && !readerCancelled) controller.close()
        }
      })()
    },
    cancel() {
      readerCancelled = true
      detached = true
    },
  })
}
