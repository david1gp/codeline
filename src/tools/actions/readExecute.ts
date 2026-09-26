import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { FileSystem } from "../filesystem/fileSystem.js"
import { FileSystemError } from "../filesystem/fileSystemError.js"
import type { FileTarget } from "../filesystem/fileTarget.js"
import { toolErrorCodes } from "../runtime/toolErrorCodes.js"
import { readToolInputSchema } from "../schema/readToolInputSchema.js"
import type { ReadToolOutput } from "../schema/readToolOutputSchema.js"

export type ReadExecuteOptions = {
  readonly fileSystem: FileSystem
  readonly outputLimit: number
  readonly projectRoot: string
  readonly signal: AbortSignal
  readonly timeoutMs: number | null
}

export type ReadExecute = (input: unknown, options: ReadExecuteOptions) => Promise<Result<ReadToolOutput>>

const READ_DEFAULT_OUTPUT_LIMIT = 16_384
const READ_DEFAULT_TIMEOUT_MS = 30_000
const READ_MAX_OUTPUT_LIMIT = 1_048_576
const READ_MAX_TIMEOUT_MS = 120_000
const READ_MAX_LINE_LENGTH = 2_000
const READ_STREAM_MIN_SIZE = 10 * 1_024 * 1_024

const readExecuteAbortMarker = Symbol("read-aborted")

type ReadLine = ReadToolOutput["lines"][number]

type ReadWindow = {
  readonly lines: ReadLine[]
  readonly totalLines: number
}

function readExecuteError(code: string, message: string) {
  return createResultErrorCode("readExecute", message, code)
}

function readExecuteAbortSignalIsValid(signal: unknown): signal is AbortSignal {
  if (typeof signal !== "object" || signal === null) return false
  if (!("aborted" in signal) || typeof signal.aborted !== "boolean") return false
  if (!("addEventListener" in signal) || typeof signal.addEventListener !== "function") return false
  return "removeEventListener" in signal && typeof signal.removeEventListener === "function"
}

function readExecuteBoundedIntegerResolve(
  value: number | null | undefined,
  fallback: number,
  maximum: number,
  nullable = false,
): number | null | undefined {
  if (value === null) return nullable ? null : undefined
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) return undefined
  return resolved
}

function readExecuteAbortError(signal: AbortSignal): FileSystemError {
  return new FileSystemError(
    signal.reason === "tool-timeout" ? "The read timed out." : "The read was aborted.",
    "FS_ABORTED",
  )
}

function readExecuteAbortResult(signal: AbortSignal) {
  const error = readExecuteAbortError(signal)
  if (signal.reason === "tool-timeout") return readExecuteError(toolErrorCodes.timeout, error.message)
  return readExecuteError(error.code, error.message)
}

function readExecuteErrorResult(error: unknown, signal: AbortSignal) {
  if (error instanceof FileSystemError) {
    if (error.code === "FS_ABORTED" && signal.reason === "tool-timeout")
      return readExecuteError(toolErrorCodes.timeout, "The read timed out.")
    return readExecuteError(error.code, error.message)
  }
  if (signal.aborted) return readExecuteAbortResult(signal)
  return readExecuteError("FS_IO_ERROR", "The file could not be read.")
}

function readExecuteAwait<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      callback()
    }
    const onAbort = (): void => finish(() => reject(readExecuteAbortError(signal)))
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }
    void operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

async function readExecuteStreamConsume(
  chunks: AsyncIterable<string>,
  signal: AbortSignal,
  consume: (chunk: string) => void,
): Promise<void> {
  const iterator = chunks[Symbol.asyncIterator]()
  let removeAbortListener: () => void = () => undefined
  let cancelPromise: Promise<unknown> | undefined
  const aborted = new Promise<typeof readExecuteAbortMarker>((resolve) => {
    const onAbort = (): void => {
      try {
        cancelPromise = Promise.resolve(iterator.return?.()).catch(() => undefined)
      } catch {
        cancelPromise = Promise.resolve()
      }
      resolve(readExecuteAbortMarker)
    }
    removeAbortListener = () => signal.removeEventListener("abort", onAbort)
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) onAbort()
  })

  try {
    while (true) {
      const nextPromise = iterator.next()
      void nextPromise.catch(() => undefined)
      const next = await Promise.race([nextPromise, aborted])
      if (next === readExecuteAbortMarker || signal.aborted) throw readExecuteAbortError(signal)
      if (next.done) return
      if (typeof next.value !== "string") throw new FileSystemError("The file stream was invalid.", "FS_IO_ERROR")
      consume(next.value)
    }
  } finally {
    removeAbortListener()
    if (cancelPromise !== undefined) await cancelPromise
  }
}

function readExecuteLineTruncate(line: string): string {
  if (line.length <= READ_MAX_LINE_LENGTH) return line
  return `${line.slice(0, READ_MAX_LINE_LENGTH)}... (line truncated to ${READ_MAX_LINE_LENGTH} chars)`
}

function readExecuteWindowBuild(
  chunks: AsyncIterable<string> | Iterable<string>,
  offset: number,
  limit: number,
  displayPath: string,
  signal: AbortSignal,
): Promise<ReadWindow> {
  const lines: ReadLine[] = []
  let totalLines = 0
  let lineBuffer = ""
  const lineBufferLimit = READ_MAX_LINE_LENGTH + 1

  const append = (value: string): void => {
    if (lineBuffer.length >= lineBufferLimit) return
    lineBuffer += value.slice(0, lineBufferLimit - lineBuffer.length)
  }
  const consumeLine = (): void => {
    totalLines += 1
    if (totalLines >= offset && lines.length < limit) {
      const text = lineBuffer.endsWith("\r") ? lineBuffer.slice(0, -1) : lineBuffer
      lines.push({ number: totalLines, text: readExecuteLineTruncate(text) })
    }
    lineBuffer = ""
  }
  const consumeChunk = (chunk: string): void => {
    let start = 0
    while (true) {
      const newline = chunk.indexOf("\n", start)
      if (newline === -1) {
        append(chunk.slice(start))
        return
      }
      append(chunk.slice(start, newline))
      consumeLine()
      start = newline + 1
    }
  }

  const consume = async (): Promise<void> => {
    if (Symbol.asyncIterator in Object(chunks)) {
      await readExecuteStreamConsume(chunks as AsyncIterable<string>, signal, consumeChunk)
      return
    }
    for (const chunk of chunks as Iterable<string>) {
      if (signal.aborted) throw readExecuteAbortError(signal)
      if (typeof chunk !== "string") throw new FileSystemError("The file stream was invalid.", "FS_IO_ERROR")
      consumeChunk(chunk)
    }
  }

  return consume().then(() => {
    if (lineBuffer.length > 0) consumeLine()
    if (offset > totalLines && !(totalLines === 0 && offset === 1))
      throw new FileSystemError(
        `offset ${offset} is out of range for "${displayPath}" (${totalLines} lines)`,
        "FS_NOT_FOUND",
      )
    return { lines, totalLines }
  })
}

function readExecuteOutputFit(output: ReadToolOutput, outputLimit: number): Result<ReadToolOutput> {
  const serialize = (lines: readonly ReadLine[]): ReadToolOutput => ({ ...output, lines: [...lines] })
  if (JSON.stringify(output).length <= outputLimit) return createResult(output)

  const emptyLines = output.lines.map((line) => ({ ...line, text: "" }))
  if (JSON.stringify(serialize(emptyLines)).length > outputLimit)
    return readExecuteError(toolErrorCodes.outputLimit, "The read output limit is too small for structured output.")

  const totalTextLength = output.lines.reduce((total, line) => total + line.text.length, 0)
  let low = 0
  let high = totalTextLength
  const linesForLength = (length: number): ReadLine[] => {
    let remaining = length
    return output.lines.map((line) => {
      const text = line.text.slice(0, Math.min(remaining, line.text.length))
      remaining -= text.length
      return { ...line, text }
    })
  }
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2)
    if (JSON.stringify(serialize(linesForLength(candidate))).length <= outputLimit) low = candidate
    else high = candidate - 1
  }

  const bounded = serialize(linesForLength(low))
  if (JSON.stringify(bounded).length > outputLimit)
    return readExecuteError(toolErrorCodes.outputLimit, "The read output limit is too small for structured output.")
  return createResult(bounded)
}

export async function readExecute(input: unknown, options: ReadExecuteOptions): Promise<Result<ReadToolOutput>> {
  const parsedInput = v.safeParse(readToolInputSchema, input)
  if (!parsedInput.success) return readExecuteError(toolErrorCodes.invalidInput, "The read input is invalid.")

  const signal = options.signal
  if (!readExecuteAbortSignalIsValid(signal))
    return readExecuteError(toolErrorCodes.invalidContext, "The read abort signal is invalid.")
  if (signal.aborted) return readExecuteErrorResult(readExecuteAbortError(signal), signal)

  const outputLimit = readExecuteBoundedIntegerResolve(
    options.outputLimit,
    READ_DEFAULT_OUTPUT_LIMIT,
    READ_MAX_OUTPUT_LIMIT,
  )
  const timeoutMs = readExecuteBoundedIntegerResolve(
    options.timeoutMs,
    READ_DEFAULT_TIMEOUT_MS,
    READ_MAX_TIMEOUT_MS,
    true,
  )
  if (outputLimit === undefined || outputLimit === null || timeoutMs === undefined)
    return readExecuteError(toolErrorCodes.invalidContext, "The read execution limits are invalid.")

  const executionController = new AbortController()
  const abortFromInput = (): void => executionController.abort(signal.reason)
  signal.addEventListener("abort", abortFromInput, { once: true })
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs !== null) timeoutHandle = setTimeout(() => executionController.abort("tool-timeout"), timeoutMs)

  try {
    if (executionController.signal.aborted) return readExecuteAbortResult(executionController.signal)

    let target: FileTarget
    try {
      target = await readExecuteAwait(
        options.fileSystem.resolve(parsedInput.output.file_path, {
          cwd: options.projectRoot,
          signal: executionController.signal,
        }),
        executionController.signal,
      )
      const info = await readExecuteAwait(
        options.fileSystem.stat(target, executionController.signal),
        executionController.signal,
      )
      if (info === undefined)
        throw new FileSystemError(`cannot read "${target.displayPath}": not found`, "FS_NOT_FOUND")
      if (info.type !== "file")
        throw new FileSystemError(`cannot read "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE")

      const offset = parsedInput.output.offset ?? 1
      const limit = parsedInput.output.limit ?? 2_000
      const source =
        info.size === undefined || !Number.isSafeInteger(info.size) || info.size >= READ_STREAM_MIN_SIZE
          ? await readExecuteAwait(
              options.fileSystem.streamText(target, executionController.signal),
              executionController.signal,
            )
          : [
              await readExecuteAwait(
                options.fileSystem.readText(target, executionController.signal),
                executionController.signal,
              ),
            ]
      const window = await readExecuteWindowBuild(source, offset, limit, target.displayPath, executionController.signal)
      if (executionController.signal.aborted) throw readExecuteAbortError(executionController.signal)
      return readExecuteOutputFit(
        {
          lines: window.lines,
          offset,
          path: target.displayPath,
          totalLines: window.totalLines,
          version: info.version,
        },
        outputLimit,
      )
    } catch (error: unknown) {
      return readExecuteErrorResult(error, executionController.signal)
    }
  } finally {
    signal.removeEventListener("abort", abortFromInput)
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }
}
