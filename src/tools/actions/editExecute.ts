import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { FileSystem } from "../filesystem/fileSystem.js"
import { FileSystemError } from "../filesystem/fileSystemError.js"
import type { FileTarget } from "../filesystem/fileTarget.js"
import { toolErrorCodes } from "../runtime/toolErrorCodes.js"
import { editToolInputSchema } from "../schema/editToolInputSchema.js"
import type { EditToolOutput } from "../schema/editToolOutputSchema.js"

export type EditExecuteOptions = {
  readonly fileSystem: FileSystem
  readonly outputLimit: number
  readonly projectRoot: string
  readonly signal: AbortSignal
  readonly timeoutMs: number | null
}

export type EditExecute = (input: unknown, options: EditExecuteOptions) => Promise<Result<EditToolOutput>>

const EDIT_DEFAULT_OUTPUT_LIMIT = 16_384
const EDIT_DEFAULT_TIMEOUT_MS = 30_000
const EDIT_MAX_OUTPUT_LIMIT = 1_048_576
const EDIT_MAX_TIMEOUT_MS = 120_000

function editExecuteError(code: string, message: string) {
  return createResultErrorCode("editExecute", message, code)
}

function editExecuteAbortSignalIsValid(signal: unknown): signal is AbortSignal {
  if (typeof signal !== "object" || signal === null) return false
  if (!("aborted" in signal) || typeof signal.aborted !== "boolean") return false
  if (!("addEventListener" in signal) || typeof signal.addEventListener !== "function") return false
  return "removeEventListener" in signal && typeof signal.removeEventListener === "function"
}

function editExecuteBoundedIntegerResolve(
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

function editExecuteAbortError(signal: AbortSignal): FileSystemError {
  return new FileSystemError(
    signal.reason === "tool-timeout" ? "The edit timed out." : "The edit was aborted.",
    "FS_ABORTED",
  )
}

function editExecuteAbortResult(signal: AbortSignal) {
  const error = editExecuteAbortError(signal)
  if (signal.reason === "tool-timeout") return editExecuteError(toolErrorCodes.timeout, error.message)
  return editExecuteError(error.code, error.message)
}

function editExecuteFileSystemErrorResult(error: FileSystemError) {
  const remedy =
    error.code === "FS_STALE_VERSION"
      ? "re-read the file, then retry"
      : error.code === "FS_NOT_OBSERVED"
        ? "read the file, then retry"
        : undefined
  const message = remedy === undefined ? error.message : `${error.message} — ${remedy}`
  return editExecuteError(error.code, message)
}

function editExecuteErrorResult(error: unknown, signal: AbortSignal) {
  if (error instanceof FileSystemError) {
    if (error.code === "FS_ABORTED" && signal.reason === "tool-timeout") return editExecuteAbortResult(signal)
    return editExecuteFileSystemErrorResult(error)
  }
  if (signal.aborted) return editExecuteAbortResult(signal)
  return editExecuteError("FS_IO_ERROR", "The file could not be edited.")
}

function editExecuteAwait<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      callback()
    }
    const onAbort = (): void => finish(() => reject(editExecuteAbortError(signal)))
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

function editExecuteOutputFit(output: EditToolOutput, outputLimit: number): Result<EditToolOutput> {
  if (JSON.stringify(output).length <= outputLimit) return createResult(output)

  const truncate = (value: string, limit: number): string => {
    if (value.length <= limit) return value
    if (limit <= 1) return "…".slice(0, limit)
    return `${value.slice(0, limit - 1)}…`
  }
  const outputCreate = (contentLength: number): EditToolOutput => {
    const afterLength = Math.min(output.after.length, contentLength)
    const beforeLength = Math.min(output.before.length, contentLength - afterLength)
    return {
      ...output,
      after: truncate(output.after, afterLength),
      before: truncate(output.before, beforeLength),
    }
  }
  const empty = outputCreate(0)
  if (JSON.stringify(empty).length > outputLimit)
    return editExecuteError(toolErrorCodes.outputLimit, "The edit output limit is too small for structured output.")

  let low = 0
  let high = output.after.length + output.before.length
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2)
    if (JSON.stringify(outputCreate(candidate)).length <= outputLimit) low = candidate
    else high = candidate - 1
  }
  const bounded = outputCreate(low)
  if (JSON.stringify(bounded).length > outputLimit)
    return editExecuteError(toolErrorCodes.outputLimit, "The edit output limit is too small for structured output.")
  return createResult(bounded)
}

export async function editExecute(input: unknown, options: EditExecuteOptions): Promise<Result<EditToolOutput>> {
  const parsedInput = v.safeParse(editToolInputSchema, input)
  if (!parsedInput.success) return editExecuteError(toolErrorCodes.invalidInput, "The edit input is invalid.")

  const signal = options.signal
  if (!editExecuteAbortSignalIsValid(signal))
    return editExecuteError(toolErrorCodes.invalidContext, "The edit abort signal is invalid.")
  if (signal.aborted) return editExecuteAbortResult(signal)

  const outputLimit = editExecuteBoundedIntegerResolve(
    options.outputLimit,
    EDIT_DEFAULT_OUTPUT_LIMIT,
    EDIT_MAX_OUTPUT_LIMIT,
  )
  const timeoutMs = editExecuteBoundedIntegerResolve(
    options.timeoutMs,
    EDIT_DEFAULT_TIMEOUT_MS,
    EDIT_MAX_TIMEOUT_MS,
    true,
  )
  if (outputLimit === undefined || outputLimit === null || timeoutMs === undefined)
    return editExecuteError(toolErrorCodes.invalidContext, "The edit execution limits are invalid.")

  const executionController = new AbortController()
  const abortFromInput = (): void => executionController.abort(signal.reason)
  signal.addEventListener("abort", abortFromInput, { once: true })
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs !== null) timeoutHandle = setTimeout(() => executionController.abort("tool-timeout"), timeoutMs)

  try {
    if (executionController.signal.aborted) return editExecuteAbortResult(executionController.signal)

    try {
      const target: FileTarget = await editExecuteAwait(
        options.fileSystem.resolve(parsedInput.output.file_path, {
          cwd: options.projectRoot,
          signal: executionController.signal,
        }),
        executionController.signal,
      )
      const info = await editExecuteAwait(
        options.fileSystem.stat(target, executionController.signal),
        executionController.signal,
      )
      if (info === undefined)
        throw new FileSystemError(`cannot edit "${target.displayPath}": not found`, "FS_NOT_FOUND")
      if (info.type !== "file")
        throw new FileSystemError(`cannot edit "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE")

      const outcome = await editExecuteAwait(
        options.fileSystem.editText(
          target,
          {
            newString: parsedInput.output.new_string,
            oldString: parsedInput.output.old_string,
            replaceAll: parsedInput.output.replace_all ?? false,
          },
          { version: info.version },
          executionController.signal,
        ),
        executionController.signal,
      )
      if (executionController.signal.aborted) throw editExecuteAbortError(executionController.signal)

      return editExecuteOutputFit(
        {
          after: outcome.after,
          before: outcome.before,
          path: target.displayPath,
        },
        outputLimit,
      )
    } catch (error: unknown) {
      return editExecuteErrorResult(error, executionController.signal)
    }
  } finally {
    signal.removeEventListener("abort", abortFromInput)
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }
}
