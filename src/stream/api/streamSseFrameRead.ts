import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { StreamSseFrame } from "./streamSseFrame.js"

type StreamSseFrameFields = {
  data: string[]
  event: string
  id: string
}

const streamSseFrameReadOperation = "streamSseFrameRead"

function streamSseFrameFieldsCreate(): StreamSseFrameFields {
  return { data: [], event: "", id: "" }
}

function streamSseFrameFieldRead(line: string): { name: string; value: string } {
  if (line.startsWith(":")) return { name: "", value: "" }
  const separator = line.indexOf(":")
  if (separator < 0) return { name: line, value: "" }
  const valueStart = line[separator + 1] === " " ? separator + 2 : separator + 1
  return { name: line.slice(0, separator), value: line.slice(valueStart) }
}

function streamSseFrameLineRead(line: string, fields: StreamSseFrameFields): StreamSseFrame | undefined {
  if (line === "") {
    if (fields.data.length === 0) return undefined
    const frame = { data: fields.data.join("\n"), event: fields.event || "message", id: fields.id }
    fields.data = []
    fields.event = ""
    return frame
  }

  const field = streamSseFrameFieldRead(line)
  if (field.name === "data") fields.data.push(field.value)
  else if (field.name === "event") fields.event = field.value
  else if (field.name === "id" && !field.value.includes("\u0000")) fields.id = field.value
  return undefined
}

function streamSseFrameLinesRead(
  input: { pending: string },
  fields: StreamSseFrameFields,
  endOfStream: boolean,
): StreamSseFrame[] {
  const frames: StreamSseFrame[] = []
  while (input.pending.length > 0) {
    const lineFeed = input.pending.indexOf("\n")
    const carriageReturn = input.pending.indexOf("\r")
    let separator = -1
    if (lineFeed >= 0 && carriageReturn >= 0) separator = Math.min(lineFeed, carriageReturn)
    else separator = Math.max(lineFeed, carriageReturn)
    if (separator < 0) return frames
    if (!endOfStream && input.pending[separator] === "\r" && separator + 1 === input.pending.length) return frames

    const isCrLf = input.pending[separator] === "\r" && input.pending[separator + 1] === "\n"
    const line = input.pending.slice(0, separator)
    input.pending = input.pending.slice(separator + (isCrLf ? 2 : 1))
    const frame = streamSseFrameLineRead(line, fields)
    if (frame !== undefined) frames.push(frame)
  }
  return frames
}

function streamSseFrameError(message: string): Result<StreamSseFrame> {
  return createResultError(streamSseFrameReadOperation, message)
}

export async function* streamSseFrameRead(
  readable: ReadableStream<Uint8Array>,
): AsyncGenerator<Result<StreamSseFrame>> {
  const reader = readable.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const input = { pending: "" }
  const fields = streamSseFrameFieldsCreate()

  try {
    while (true) {
      let next: Awaited<ReturnType<typeof reader.read>>
      try {
        next = await reader.read()
      } catch (_error) {
        yield streamSseFrameError("The SSE response could not be read.")
        return
      }
      if (next.done) break

      let decoded: string
      try {
        decoded = decoder.decode(next.value, { stream: true })
      } catch (_error) {
        yield streamSseFrameError("The SSE response contains invalid UTF-8.")
        return
      }
      input.pending += decoded
      for (const frame of streamSseFrameLinesRead(input, fields, false)) yield createResult(frame)
    }

    try {
      input.pending += decoder.decode()
    } catch (_error) {
      yield streamSseFrameError("The SSE response contains invalid UTF-8.")
      return
    }
    for (const frame of streamSseFrameLinesRead(input, fields, true)) yield createResult(frame)
    if (input.pending.length > 0 || fields.data.length > 0)
      yield streamSseFrameError("The SSE response ended with an incomplete frame.")
  } finally {
    reader.releaseLock()
  }
}
