import type { Page } from "@playwright/test"

type SseFrame = {
  data: Record<string, unknown>
  event: string
  id: string
}

type SseRead = {
  body: string
  elapsedMs: number
  frames: SseFrame[]
  heartbeat: boolean
  headers: Record<string, string>
  status: number
}

type SseReadCondition = "frames" | "frames-and-heartbeat" | "heartbeat"

type SseReadOptions = {
  condition?: SseReadCondition
  minimumFrames?: number
  timeoutMs?: number
}

export async function managedOriginSseRead(page: Page, path: string, options: SseReadOptions = {}): Promise<SseRead> {
  const condition = options.condition ?? "frames-and-heartbeat"
  const minimumFrames = options.minimumFrames ?? 0
  const timeoutMs = options.timeoutMs ?? 30_000
  return page.evaluate(
    async ({ condition: targetCondition, minimumFrames: target, path: requestPath, timeoutMs: timeout }) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        try {
          controller.abort()
        } catch {
          // Cleanup must not mask the stream assertion result.
        }
      }, timeout)
      const startedAt = performance.now()
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let readerActive = false
      let completed = false
      try {
        const response = await fetch(requestPath, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(
            `The managed event feed request failed with status ${response.status} ${response.statusText}.`,
          )
        }
        reader = response.body?.getReader()
        if (reader === undefined) throw new Error("The managed event feed has no readable body.")
        readerActive = true

        const decoder = new TextDecoder()
        const frames: SseFrame[] = []
        let body = ""
        let buffered = ""
        let pendingCarriageReturn = false
        let heartbeat = false

        const blockProcess = (block: string): void => {
          let event = "message"
          let id = ""
          const dataLines: string[] = []
          for (const line of block.split("\n")) {
            if (line.startsWith(":")) {
              if (line.slice(1).trim() === "heartbeat") heartbeat = true
              continue
            }

            const separator = line.indexOf(":")
            const field = separator < 0 ? line : line.slice(0, separator)
            let value = separator < 0 ? "" : line.slice(separator + 1)
            if (value.startsWith(" ")) value = value.slice(1)
            if (field === "event") event = value
            else if (field === "id") id = value
            else if (field === "data") dataLines.push(value)
          }
          if (dataLines.length === 0 || frames.length >= target) return
          frames.push({ data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>, event, id })
        }

        const blocksProcess = (): void => {
          let separator = buffered.indexOf("\n\n")
          while (separator >= 0) {
            blockProcess(buffered.slice(0, separator))
            buffered = buffered.slice(separator + 2)
            separator = buffered.indexOf("\n\n")
          }
        }

        const textAppend = (text: string): void => {
          if (pendingCarriageReturn) {
            buffered += "\n"
            pendingCarriageReturn = false
            if (text.startsWith("\n")) text = text.slice(1)
          }
          if (text.endsWith("\r")) {
            pendingCarriageReturn = true
            text = text.slice(0, -1)
          }
          buffered += text.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
          blocksProcess()
        }

        const conditionSatisfied = (): boolean => {
          if (targetCondition === "heartbeat") return heartbeat
          if (targetCondition === "frames") return frames.length >= target
          return frames.length >= target && heartbeat
        }

        while (!conditionSatisfied()) {
          const next = await reader.read()
          if (next.done || next.value === undefined) {
            readerActive = false
            const text = decoder.decode()
            body += text
            textAppend(text)
            if (pendingCarriageReturn) {
              buffered += "\n"
              pendingCarriageReturn = false
              blocksProcess()
            }
            break
          }
          const text = decoder.decode(next.value, { stream: true })
          body += text
          textAppend(text)
        }

        if (!conditionSatisfied()) {
          const targetDescription =
            targetCondition === "heartbeat"
              ? "its heartbeat"
              : targetCondition === "frames"
                ? `${target} frame${target === 1 ? "" : "s"}`
                : `${target} frame${target === 1 ? "" : "s"} and its heartbeat`
          throw new Error(`The managed event feed closed before ${targetDescription}.`)
        }

        const result = {
          body,
          elapsedMs: performance.now() - startedAt,
          frames,
          heartbeat,
          headers: Object.fromEntries(response.headers.entries()),
          status: response.status,
        }
        completed = true
        return result
      } catch (error) {
        if (!completed && readerActive && !controller.signal.aborted) {
          try {
            controller.abort()
          } catch {
            // Cleanup must not mask the stream assertion result.
          }
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
        if (reader !== undefined) {
          try {
            await reader.cancel()
            readerActive = false
          } catch {
            // Cleanup must not mask the stream assertion result.
          }
        }
      }
    },
    { condition, minimumFrames, path, timeoutMs },
  )
}
