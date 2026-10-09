type DeferredAbortControllerOptions = {
  /**
   * Upstream abort signal (run cancellation). While a tool is executing, the
   * abort is remembered instead of forwarded so the tool completes first.
   */
  signal: AbortSignal
  /**
   * Additional stop condition checked at safe boundaries (e.g. a graceful
   * cancel request). Never aborts mid-tool either.
   */
  isCancelRequested?: () => boolean
}

/**
 * An AbortController that defers graceful cancellation until no tool is in
 * flight. The tool loop brackets every tool execution with
 * `toolStart`/`toolEnd` and calls `boundaryCheck` on each streamed chunk
 * boundary; the inner signal aborts at the first boundary with zero
 * in-flight tools after `isCancelRequested` turns true, so the current tool
 * completes and persists before the run terminates. Direct upstream aborts
 * (immediate stop, shutdown) still forward instantly, even mid-tool.
 * `policyAborted` distinguishes deferred aborts from upstream aborts so
 * terminal handling can avoid reporting an error.
 */
export function deferredAbortControllerCreate(options: DeferredAbortControllerOptions) {
  const inner = new AbortController()
  let inFlight = 0

  const forwardAbort = (): void => {
    if (!inner.signal.aborted) inner.abort()
  }

  const onUpstreamAbort = (): void => {
    forwardAbort()
  }
  if (options.signal.aborted) {
    forwardAbort()
  } else {
    options.signal.addEventListener("abort", onUpstreamAbort, { once: true })
  }

  const toolStart = (): void => {
    inFlight += 1
  }

  const toolEnd = (): void => {
    inFlight = Math.max(0, inFlight - 1)
    boundaryCheck()
  }

  const boundaryCheck = (): void => {
    if (inner.signal.aborted || inFlight > 0) return
    if (options.isCancelRequested?.() === true) forwardAbort()
  }

  /** True when the inner signal aborted without an upstream abort. */
  const policyAborted = (): boolean => inner.signal.aborted && !options.signal.aborted

  const detach = (): void => {
    options.signal.removeEventListener("abort", onUpstreamAbort)
  }

  return { boundaryCheck, controller: inner, detach, policyAborted, signal: inner.signal, toolEnd, toolStart }
}

export type DeferredAbortController = ReturnType<typeof deferredAbortControllerCreate>
