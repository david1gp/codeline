import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { toolErrorCodes } from "../runtime/toolErrorCodes.js"
import type { BashToolInput } from "../schema/bashToolInputSchema.js"
import { bashToolInputSchema } from "../schema/bashToolInputSchema.js"
import type { BashToolOutput } from "../schema/bashToolOutputSchema.js"

const bashDefaultOutputLimit = 16_384
const bashDefaultTimeoutMs = 30_000
const bashMaximumOutputLimit = 1_048_576
const bashMaximumTimeoutMs = 120_000

type BashExecuteOptions = {
  outputLimit?: number
  projectRoot: string
  signal?: AbortSignal
  timeoutMs?: number | null
}

type BashOutputCapture = {
  append: (chunk: Uint8Array) => void
  text: () => string
  truncated: () => boolean
}

type BashStreamReadResult = "aborted" | "failed" | "finished"

const abortMarker = Symbol("bash-aborted")

function bashExecuteError(code: string, message: string) {
  return createResultErrorCode("bashExecute", message, code)
}

function bashExecuteAbortSignalIsValid(signal: unknown): signal is AbortSignal {
  if (typeof signal !== "object" || signal === null) return false
  if (!("aborted" in signal) || typeof signal.aborted !== "boolean") return false
  if (!("addEventListener" in signal) || typeof signal.addEventListener !== "function") return false
  return "removeEventListener" in signal && typeof signal.removeEventListener === "function"
}

function bashExecuteLimitResolve(
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

function bashExecutePathIsWithin(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

async function bashExecuteWorkingDirectoryResolve(
  projectRoot: string,
  requestedWorkingDirectory: string | undefined,
): Promise<Result<{ projectRoot: string; workingDirectory: string }>> {
  if (projectRoot.length === 0 || !path.isAbsolute(projectRoot) || projectRoot.includes("\0"))
    return bashExecuteError(toolErrorCodes.invalidContext, "The bash project root is invalid.")

  let resolvedProjectRoot: string
  try {
    resolvedProjectRoot = await fs.realpath(projectRoot)
    const rootStat = await fs.stat(resolvedProjectRoot)
    if (!rootStat.isDirectory())
      return bashExecuteError(toolErrorCodes.invalidContext, "The bash project root is invalid.")
  } catch {
    return bashExecuteError(toolErrorCodes.invalidContext, "The bash project root is invalid.")
  }

  const requestedPath =
    requestedWorkingDirectory === undefined
      ? resolvedProjectRoot
      : path.isAbsolute(requestedWorkingDirectory)
        ? path.resolve(requestedWorkingDirectory)
        : path.resolve(resolvedProjectRoot, requestedWorkingDirectory)

  let resolvedWorkingDirectory: string
  try {
    resolvedWorkingDirectory = await fs.realpath(requestedPath)
    const directoryStat = await fs.stat(resolvedWorkingDirectory)
    if (!directoryStat.isDirectory())
      return bashExecuteError(toolErrorCodes.invalidInput, "The bash working directory is invalid.")
  } catch {
    return bashExecuteError(toolErrorCodes.invalidInput, "The bash working directory is invalid.")
  }
  if (!bashExecutePathIsWithin(resolvedProjectRoot, resolvedWorkingDirectory))
    return bashExecuteError(toolErrorCodes.invalidInput, "The bash working directory must be a project descendant.")

  return createResult({ projectRoot: resolvedProjectRoot, workingDirectory: resolvedWorkingDirectory })
}

function bashExecuteOutputCaptureCreate(maxBytes: number): BashOutputCapture {
  const chunks: Uint8Array[] = []
  let capturedBytes = 0
  let wasTruncated = false

  const append = (chunk: Uint8Array): void => {
    if (chunk.byteLength === 0) return
    const remaining = maxBytes - capturedBytes
    if (remaining <= 0) {
      wasTruncated = true
      return
    }
    const captured = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk
    chunks.push(captured.slice())
    capturedBytes += captured.byteLength
    if (captured.byteLength !== chunk.byteLength) wasTruncated = true
  }

  return {
    append,
    text: () => {
      const bytes = new Uint8Array(capturedBytes)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      return new TextDecoder().decode(bytes)
    },
    truncated: () => wasTruncated,
  }
}

async function bashExecuteStreamRead(
  stream: ReadableStream<Uint8Array> | null,
  capture: BashOutputCapture,
  signal: AbortSignal,
): Promise<BashStreamReadResult> {
  if (stream === null) return "finished"

  const reader = stream.getReader()
  let cancelPromise: Promise<void> | undefined
  let removeAbortListener: () => void = () => undefined
  const aborted = new Promise<typeof abortMarker>((resolve) => {
    const abort = () => {
      cancelPromise = reader.cancel().then(
        () => undefined,
        () => undefined,
      )
      resolve(abortMarker)
    }
    removeAbortListener = () => signal.removeEventListener("abort", abort)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
  })

  try {
    while (true) {
      const read = reader.read()
      void read.catch(() => undefined)
      const next = await Promise.race([read, aborted])
      if (next === abortMarker || signal.aborted) return "aborted"
      if (next.done) return "finished"
      capture.append(next.value)
    }
  } catch {
    return signal.aborted ? "aborted" : "failed"
  } finally {
    removeAbortListener()
    if (cancelPromise !== undefined) await cancelPromise
    reader.releaseLock()
  }
}

function bashExecuteOutputFit(input: {
  exitCode: number
  maxLength: number
  stderr: string
  stdout: string
  truncated: boolean
  workingDirectory: string
}): Result<BashToolOutput> {
  const serialize = (stdout: string, stderr: string) => ({
    exitCode: input.exitCode,
    stderr,
    stdout,
    truncated: input.truncated,
    workingDirectory: input.workingDirectory,
  })
  const serializedLength = (stdout: string, stderr: string) => JSON.stringify(serialize(stdout, stderr)).length
  if (serializedLength(input.stdout, input.stderr) <= input.maxLength)
    return createResult(serialize(input.stdout, input.stderr))

  const totalLength = input.stdout.length + input.stderr.length
  let low = 0
  let high = totalLength
  while (low < high) {
    const candidateLength = Math.ceil((low + high) / 2)
    const stdoutLength = totalLength === 0 ? 0 : Math.floor((candidateLength * input.stdout.length) / totalLength)
    const stderrLength = candidateLength - stdoutLength
    if (serializedLength(input.stdout.slice(0, stdoutLength), input.stderr.slice(0, stderrLength)) <= input.maxLength)
      low = candidateLength
    else high = candidateLength - 1
  }

  const stdoutLength = totalLength === 0 ? 0 : Math.floor((low * input.stdout.length) / totalLength)
  const stderrLength = low - stdoutLength
  const output = serialize(input.stdout.slice(0, stdoutLength), input.stderr.slice(0, stderrLength))
  if (serializedLength(output.stdout, output.stderr) > input.maxLength)
    return bashExecuteError(toolErrorCodes.outputLimit, "The bash output limit is too small for structured output.")
  output.truncated = true
  return createResult(output)
}

function bashExecuteAbortKindResolve(signal: AbortSignal): "aborted" | "timeout" {
  return signal.reason === "tool-timeout" ? "timeout" : "aborted"
}

async function bashExecuteProcessRun(
  input: BashToolInput,
  options: {
    outputLimit: number
    signal: AbortSignal
    timeoutMs: number | null
    workingDirectory: string
  },
): Promise<Result<BashToolOutput>> {
  const spawned = (() => {
    try {
      return createResult(
        Bun.spawn({
          cmd: ["bash", "-lc", input.command],
          cwd: options.workingDirectory,
          detached: true,
          stderr: "pipe",
          stdin: "ignore",
          stdout: "pipe",
        }),
      )
    } catch {
      return bashExecuteError(toolErrorCodes.executionFailed, "The bash command could not be executed.")
    }
  })()
  if (!spawned.success) return spawned

  const child = spawned.data
  const stdout = bashExecuteOutputCaptureCreate(options.outputLimit)
  const stderr = bashExecuteOutputCaptureCreate(options.outputLimit)

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutController = new AbortController()
  const abortFromInput = () => timeoutController.abort(options.signal.reason)
  options.signal.addEventListener("abort", abortFromInput, { once: true })
  if (options.signal.aborted) abortFromInput()
  if (options.timeoutMs !== null)
    timeoutHandle = setTimeout(() => timeoutController.abort("tool-timeout"), options.timeoutMs)

  const outputSignal = timeoutController.signal
  let processKilled = false
  const killProcess = () => {
    if (processKilled) return
    processKilled = true
    try {
      if (process.platform === "win32") child.kill("SIGKILL")
      else process.kill(-child.pid, "SIGKILL")
    } catch {
      // The process may have exited between the abort and kill calls.
    }
  }
  outputSignal.addEventListener("abort", killProcess, { once: true })
  if (outputSignal.aborted) killProcess()
  const stdoutRead = bashExecuteStreamRead(child.stdout, stdout, outputSignal)
  const stderrRead = bashExecuteStreamRead(child.stderr, stderr, outputSignal)
  type BashProcessStatus = { exitCode: number; type: "finished" } | { type: "aborted" } | { type: "failed" }
  let processStatus: BashProcessStatus | undefined
  let resolveProcessStatus: ((status: BashProcessStatus) => void) | undefined
  const processStatusPromise = new Promise<BashProcessStatus>((resolve) => {
    resolveProcessStatus = resolve
  })
  const settleProcessStatus = (status: BashProcessStatus): void => {
    if (processStatus !== undefined) return
    processStatus = status
    resolveProcessStatus?.(status)
  }
  const onAbort = () => {
    settleProcessStatus({ type: "aborted" })
  }
  outputSignal.addEventListener("abort", onAbort, { once: true })
  if (outputSignal.aborted) onAbort()

  void child.exited.then(
    (exitCode) => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
      settleProcessStatus({ exitCode, type: "finished" })
    },
    () => settleProcessStatus({ type: "failed" }),
  )

  const statuses = await Promise.all([stdoutRead, stderrRead, processStatusPromise]).finally(() => {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
    options.signal.removeEventListener("abort", abortFromInput)
    outputSignal.removeEventListener("abort", killProcess)
    outputSignal.removeEventListener("abort", onAbort)
  })
  const [stdoutStatus, stderrStatus, exitStatus] = statuses

  if (exitStatus.type === "aborted") {
    const abortKind = bashExecuteAbortKindResolve(outputSignal)
    return bashExecuteError(
      abortKind === "timeout" ? toolErrorCodes.timeout : toolErrorCodes.aborted,
      abortKind === "timeout" ? "The bash command timed out." : "The bash command was aborted.",
    )
  }
  if (stdoutStatus === "failed" || stderrStatus === "failed" || exitStatus.type !== "finished")
    return bashExecuteError(toolErrorCodes.executionFailed, "The bash command output could not be read.")

  return bashExecuteOutputFit({
    exitCode: exitStatus.exitCode,
    maxLength: options.outputLimit,
    stderr: stderr.text(),
    stdout: stdout.text(),
    truncated: stdout.truncated() || stderr.truncated(),
    workingDirectory: options.workingDirectory,
  })
}

export async function bashExecute(input: unknown, options: BashExecuteOptions): Promise<Result<BashToolOutput>> {
  const parsedInput = v.safeParse(bashToolInputSchema, input)
  if (!parsedInput.success) return bashExecuteError(toolErrorCodes.invalidInput, "The bash input is invalid.")

  const signal = options.signal ?? new AbortController().signal
  if (!bashExecuteAbortSignalIsValid(signal))
    return bashExecuteError(toolErrorCodes.invalidContext, "The bash abort signal is invalid.")
  const outputLimit = bashExecuteLimitResolve(options.outputLimit, bashDefaultOutputLimit, bashMaximumOutputLimit)
  const timeoutMs = bashExecuteLimitResolve(options.timeoutMs, bashDefaultTimeoutMs, bashMaximumTimeoutMs, true)
  if (outputLimit === undefined || outputLimit === null || timeoutMs === undefined)
    return bashExecuteError(toolErrorCodes.invalidContext, "The bash execution limits are invalid.")
  if (signal.aborted)
    return bashExecuteError(
      bashExecuteAbortKindResolve(signal) === "timeout" ? toolErrorCodes.timeout : toolErrorCodes.aborted,
      bashExecuteAbortKindResolve(signal) === "timeout"
        ? "The bash command timed out."
        : "The bash command was aborted.",
    )

  const workingDirectory = await bashExecuteWorkingDirectoryResolve(
    options.projectRoot,
    parsedInput.output.workingDirectory,
  )
  if (!workingDirectory.success) return workingDirectory
  return bashExecuteProcessRun(parsedInput.output, {
    outputLimit,
    signal,
    timeoutMs,
    workingDirectory: workingDirectory.data.workingDirectory,
  })
}
