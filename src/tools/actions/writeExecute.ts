import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { FileSystem } from "../filesystem/fileSystem.js"
import { FileSystemError } from "../filesystem/fileSystemError.js"
import type { FileTarget } from "../filesystem/fileTarget.js"
import { fileVersion } from "../filesystem/fileVersion.js"
import { toolErrorCodes } from "../runtime/toolErrorCodes.js"
import { writeToolInputSchema } from "../schema/writeToolInputSchema.js"
import type { WriteToolOutput } from "../schema/writeToolOutputSchema.js"

export type WriteExecuteOptions = {
  readonly fileSystem: FileSystem
  readonly outputLimit: number
  readonly projectRoot: string
  readonly signal: AbortSignal
  readonly timeoutMs: number | null
}

export type WriteExecute = (input: unknown, options: WriteExecuteOptions) => Promise<Result<WriteToolOutput>>

const WRITE_DEFAULT_OUTPUT_LIMIT = 16_384
const WRITE_DEFAULT_TIMEOUT_MS = 30_000
const WRITE_MAX_OUTPUT_LIMIT = 1_048_576
const WRITE_MAX_TIMEOUT_MS = 120_000

function writeExecuteError(code: string, message: string) {
  return createResultErrorCode("writeExecute", message, code)
}

function writeExecuteAbortSignalIsValid(signal: unknown): signal is AbortSignal {
  if (typeof signal !== "object" || signal === null) return false
  if (!("aborted" in signal) || typeof signal.aborted !== "boolean") return false
  if (!("addEventListener" in signal) || typeof signal.addEventListener !== "function") return false
  return "removeEventListener" in signal && typeof signal.removeEventListener === "function"
}

function writeExecuteBoundedIntegerResolve(
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

function writeExecuteAbortError(signal: AbortSignal): FileSystemError {
  return new FileSystemError(
    signal.reason === "tool-timeout" ? "The write timed out." : "The write was aborted.",
    "FS_ABORTED",
  )
}

function writeExecuteAbortResult(signal: AbortSignal) {
  const error = writeExecuteAbortError(signal)
  if (signal.reason === "tool-timeout") return writeExecuteError(toolErrorCodes.timeout, error.message)
  return writeExecuteError(error.code, error.message)
}

function writeExecuteFileSystemErrorResult(error: FileSystemError) {
  const remedy =
    error.code === "FS_STALE_VERSION"
      ? "re-read the file, then retry"
      : error.code === "FS_NOT_OBSERVED"
        ? "read the file, then retry"
        : undefined
  const message = remedy === undefined ? error.message : `${error.message} — ${remedy}`
  return writeExecuteError(error.code, message)
}

function writeExecuteErrorResult(error: unknown, signal: AbortSignal) {
  if (error instanceof FileSystemError) {
    if (error.code === "FS_ABORTED" && signal.reason === "tool-timeout") return writeExecuteAbortResult(signal)
    return writeExecuteFileSystemErrorResult(error)
  }
  if (signal.aborted) return writeExecuteAbortResult(signal)
  return writeExecuteError("FS_IO_ERROR", "The file could not be written.")
}

function writeExecuteAwait<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      callback()
    }
    const onAbort = (): void => finish(() => reject(writeExecuteAbortError(signal)))
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

function writeExecuteOutputFit(output: WriteToolOutput, outputLimit: number): Result<WriteToolOutput> {
  if (JSON.stringify(output).length <= outputLimit) return createResult(output)

  const truncate = (value: string, limit: number): string => {
    if (value.length <= limit) return value
    if (limit <= 1) return "…".slice(0, limit)
    return `${value.slice(0, limit - 1)}…`
  }
  const outputCreate = (contentLength: number): WriteToolOutput => {
    let remaining = contentLength
    const afterLength = Math.min(output.after.length, remaining)
    remaining -= afterLength
    const beforeLength = output.before === null ? 0 : Math.min(output.before.length, remaining)
    return {
      ...output,
      after: truncate(output.after, afterLength),
      before: output.before === null ? null : truncate(output.before, beforeLength),
    }
  }
  const empty = outputCreate(0)
  if (JSON.stringify(empty).length > outputLimit)
    return writeExecuteError(toolErrorCodes.outputLimit, "The write output limit is too small for structured output.")

  let low = 0
  let high = output.after.length + (output.before?.length ?? 0)
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2)
    if (JSON.stringify(outputCreate(candidate)).length <= outputLimit) low = candidate
    else high = candidate - 1
  }
  const bounded = outputCreate(low)
  if (JSON.stringify(bounded).length > outputLimit)
    return writeExecuteError(toolErrorCodes.outputLimit, "The write output limit is too small for structured output.")
  return createResult(bounded)
}

export async function writeExecute(input: unknown, options: WriteExecuteOptions): Promise<Result<WriteToolOutput>> {
  const parsedInput = v.safeParse(writeToolInputSchema, input)
  if (!parsedInput.success) return writeExecuteError(toolErrorCodes.invalidInput, "The write input is invalid.")

  const signal = options.signal
  if (!writeExecuteAbortSignalIsValid(signal))
    return writeExecuteError(toolErrorCodes.invalidContext, "The write abort signal is invalid.")
  if (signal.aborted) return writeExecuteAbortResult(signal)

  const outputLimit = writeExecuteBoundedIntegerResolve(
    options.outputLimit,
    WRITE_DEFAULT_OUTPUT_LIMIT,
    WRITE_MAX_OUTPUT_LIMIT,
  )
  const timeoutMs = writeExecuteBoundedIntegerResolve(
    options.timeoutMs,
    WRITE_DEFAULT_TIMEOUT_MS,
    WRITE_MAX_TIMEOUT_MS,
    true,
  )
  if (outputLimit === undefined || outputLimit === null || timeoutMs === undefined)
    return writeExecuteError(toolErrorCodes.invalidContext, "The write execution limits are invalid.")

  const executionController = new AbortController()
  const abortFromInput = (): void => executionController.abort(signal.reason)
  signal.addEventListener("abort", abortFromInput, { once: true })
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs !== null) timeoutHandle = setTimeout(() => executionController.abort("tool-timeout"), timeoutMs)

  try {
    if (executionController.signal.aborted) return writeExecuteAbortResult(executionController.signal)

    try {
      const target: FileTarget = await writeExecuteAwait(
        options.fileSystem.resolve(parsedInput.output.file_path, {
          cwd: options.projectRoot,
          signal: executionController.signal,
        }),
        executionController.signal,
      )
      const info = await writeExecuteAwait(
        options.fileSystem.stat(target, executionController.signal),
        executionController.signal,
      )
      if (info !== undefined && info.type !== "file")
        throw new FileSystemError(`cannot write "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE")

      const expected =
        parsedInput.output.version === undefined
          ? ({ kind: "createIfAbsent" } as const)
          : ({ kind: "replaceIfVersion", version: fileVersion(parsedInput.output.version) } as const)
      const outcome = await writeExecuteAwait(
        options.fileSystem.writeText(target, parsedInput.output.content, expected, executionController.signal),
        executionController.signal,
      )
      if (executionController.signal.aborted) throw writeExecuteAbortError(executionController.signal)

      return writeExecuteOutputFit(
        {
          after: outcome.after,
          before: outcome.before,
          operation: outcome.operation,
          path: target.displayPath,
        },
        outputLimit,
      )
    } catch (error: unknown) {
      return writeExecuteErrorResult(error, executionController.signal)
    }
  } finally {
    signal.removeEventListener("abort", abortFromInput)
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }
}
