import { apiDiagnosticsLimits } from "../../api/diagnostics/apiDiagnosticsLimits.js"
import type { BrowserDiagnosticEvent, BrowserDiagnosticEventInput } from "./browserDiagnosticEventSchema.js"
import { browserDiagnosticsEventSanitize } from "./browserDiagnosticsEventSanitize.js"

export type BrowserDiagnosticsCollectorOptions = {
  batchSize?: number
  console?: Console
  endpoint?: string
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  flushIntervalMs?: number
  maxQueueSize?: number
  now?: () => number
  window?: Window & typeof globalThis
}

export type BrowserDiagnosticsCollector = {
  destroy: () => void
  flush: () => Promise<void>
  isReporting: () => boolean
  pendingCount: () => number
  record: (entry: BrowserDiagnosticEventInput) => void
}

function consoleArgsExtract(
  args: readonly unknown[],
  defaultMessage: string,
): {
  data?: unknown
  message: string
  stack?: string
} {
  if (args.length === 0) {
    return { message: defaultMessage }
  }

  let stack: string | undefined
  const parts: string[] = []
  const dataItems: unknown[] = []

  for (const arg of args) {
    if (arg instanceof Error) {
      parts.push(arg.stack ? arg.stack : `${arg.name}: ${arg.message}`)
      if (stack === undefined && arg.stack) {
        stack = arg.stack
      }
    } else if (typeof arg === "string") {
      parts.push(arg)
    } else if (typeof arg === "number" || typeof arg === "boolean" || arg === null || arg === undefined) {
      parts.push(String(arg))
    } else if (typeof arg === "object") {
      dataItems.push(arg)
      try {
        parts.push(JSON.stringify(arg))
      } catch (_error) {
        parts.push(String(arg))
      }
    } else {
      parts.push(String(arg))
    }
  }

  const message = parts.join(" ").trim() || defaultMessage
  const data = dataItems.length === 1 ? dataItems[0] : dataItems.length > 1 ? dataItems : undefined

  return { data, message, stack }
}

export function browserDiagnosticsCollectorCreate(
  options: BrowserDiagnosticsCollectorOptions = {},
): BrowserDiagnosticsCollector {
  const endpoint = options.endpoint ?? "/api/diagnostics/logs"
  const batchSize = Math.min(
    Math.max(options.batchSize ?? apiDiagnosticsLimits.maxBatchSize, 1),
    apiDiagnosticsLimits.maxBatchSize,
  )
  const maxQueueSize = Math.max(options.maxQueueSize ?? 200, batchSize)
  const flushIntervalMs = Math.max(options.flushIntervalMs ?? 1000, 10)
  const now = options.now ?? (() => Date.now())

  const targetWindow = options.window
  const targetConsole = options.console
  const originalFetch =
    options.fetch ?? (targetWindow ? targetWindow.fetch.bind(targetWindow) : globalThis.fetch?.bind(globalThis))

  const queue: BrowserDiagnosticEvent[] = []
  let isSending = false
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  const currentUrlGet = (): string | undefined => {
    if (targetWindow?.location?.href !== undefined) return targetWindow.location.href
    if (typeof window !== "undefined" && window.location?.href !== undefined) return window.location.href
    return undefined
  }

  const isDiagnosticsEndpoint = (url: string): boolean => {
    if (url === endpoint || url.startsWith(`${endpoint}?`) || url.startsWith(`${endpoint}#`)) return true
    if (url.includes("/diagnostics/logs")) return true
    return false
  }

  const scheduleFlush = () => {
    if (flushTimer !== undefined) return
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      void flush()
    }, flushIntervalMs)
  }

  const record = (entry: BrowserDiagnosticEventInput): void => {
    try {
      const sanitized = browserDiagnosticsEventSanitize(entry)
      queue.push(sanitized)
      while (queue.length > maxQueueSize) {
        queue.shift()
      }
      if (queue.length >= batchSize) {
        void flush()
      } else {
        scheduleFlush()
      }
    } catch (_error) {
      // Guard against enqueuing failures
    }
  }

  const flush = async (): Promise<void> => {
    if (flushTimer !== undefined) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }
    if (queue.length === 0 || isSending || originalFetch === undefined) return

    const batch = queue.splice(0, batchSize)
    if (batch.length === 0) return

    isSending = true
    try {
      await originalFetch(endpoint, {
        body: JSON.stringify({ logs: batch }),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "POST",
      })
    } catch (_error) {
      // Ingestion failures (network offline, 401 unauthenticated, 500) are silently ignored
    } finally {
      isSending = false
      if (queue.length > 0) {
        scheduleFlush()
      }
    }
  }

  // Wrap console
  const originalConsoleError = targetConsole?.error
  const originalConsoleWarn = targetConsole?.warn

  if (targetConsole !== undefined) {
    targetConsole.error = (...args: unknown[]) => {
      try {
        originalConsoleError?.apply(targetConsole, args)
      } catch (_error) {
        // Preserve console execution
      }
      if (isSending) return
      try {
        const { message, stack, data } = consoleArgsExtract(args, "console.error")
        record({
          data,
          level: "error",
          message,
          source: "console.error",
          stack,
          timestamp: now(),
          url: currentUrlGet(),
        })
      } catch (_error) {
        // Never throw from console interceptor
      }
    }

    targetConsole.warn = (...args: unknown[]) => {
      try {
        originalConsoleWarn?.apply(targetConsole, args)
      } catch (_error) {
        // Preserve console execution
      }
      if (isSending) return
      try {
        const { message, stack, data } = consoleArgsExtract(args, "console.warn")
        record({
          data,
          level: "warn",
          message,
          source: "console.warn",
          stack,
          timestamp: now(),
          url: currentUrlGet(),
        })
      } catch (_error) {
        // Never throw from console interceptor
      }
    }
  }

  // Listeners
  const onErrorListener = (event: Event | ErrorEvent) => {
    if (isSending) return
    try {
      let message = "Uncaught error"
      let stack: string | undefined
      let source = "window.onerror"

      if ("message" in event && typeof event.message === "string" && event.message.length > 0) {
        message = event.message
      }
      if ("filename" in event && typeof event.filename === "string" && event.filename.length > 0) {
        source = `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}`
      }
      if ("error" in event && event.error !== null && event.error !== undefined) {
        if (event.error instanceof Error) {
          if (!message || message === "Uncaught error") message = event.error.message
          stack = event.error.stack
        } else if (typeof event.error === "object") {
          try {
            message = JSON.stringify(event.error)
          } catch (_error) {
            message = String(event.error)
          }
        }
      }

      record({
        level: "error",
        message,
        source,
        stack,
        timestamp: now(),
        url: currentUrlGet(),
      })
    } catch (_error) {
      // Guard against handler errors
    }
  }

  const onUnhandledRejectionListener = (event: PromiseRejectionEvent) => {
    if (isSending) return
    try {
      const reason = event.reason
      let message = "Unhandled promise rejection"
      let stack: string | undefined

      if (reason instanceof Error) {
        message = reason.message || "Unhandled promise rejection"
        stack = reason.stack
      } else if (typeof reason === "string" && reason.length > 0) {
        message = reason
      } else if (reason !== null && reason !== undefined) {
        try {
          message = JSON.stringify(reason)
        } catch (_error) {
          message = String(reason)
        }
      }

      record({
        level: "error",
        message,
        source: "unhandledrejection",
        stack,
        timestamp: now(),
        url: currentUrlGet(),
      })
    } catch (_error) {
      // Guard against handler errors
    }
  }

  const onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      void flush()
    }
  }

  const onPageHide = () => {
    void flush()
  }

  const onBeforeUnload = () => {
    void flush()
  }

  // Wrap Fetch
  const originalWindowFetch = targetWindow?.fetch

  const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = ""
    try {
      url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input)
    } catch (_error) {
      url = ""
    }

    if (isSending || (url.length > 0 && isDiagnosticsEndpoint(url))) {
      return originalFetch!(input, init)
    }

    let method = "GET"
    if (init?.method !== undefined) {
      method = String(init.method).toUpperCase()
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      method = input.method.toUpperCase()
    }

    let response: Response
    try {
      response = await originalFetch!(input, init)
    } catch (error) {
      if (!isSending) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error ? error.stack : undefined
        record({
          data: { method, status: 0, statusText: "network_error" },
          level: "error",
          message: `Network request failed (${method} ${url}): ${errorMessage}`,
          source: "fetch",
          stack,
          timestamp: now(),
          url: currentUrlGet(),
        })
      }
      throw error
    }

    if (!response.ok && !isSending) {
      record({
        data: { method, status: response.status, statusText: response.statusText },
        level: "error",
        message: `HTTP ${response.status} ${response.statusText || "Request failed"} (${method} ${url})`,
        source: "fetch",
        timestamp: now(),
        url: currentUrlGet(),
      })
    }

    return response
  }

  if (targetWindow !== undefined && originalFetch !== undefined) {
    targetWindow.fetch = wrappedFetch as unknown as typeof fetch

    targetWindow.addEventListener?.("error", onErrorListener as EventListener)
    targetWindow.addEventListener?.("unhandledrejection", onUnhandledRejectionListener as EventListener)
    targetWindow.addEventListener?.("pagehide", onPageHide as EventListener)
    targetWindow.addEventListener?.("beforeunload", onBeforeUnload as EventListener)
    if (typeof targetWindow.document !== "undefined") {
      targetWindow.document.addEventListener?.("visibilitychange", onVisibilityChange as EventListener)
    }
  }

  const destroy = (): void => {
    if (flushTimer !== undefined) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }
    if (targetConsole !== undefined) {
      if (originalConsoleError !== undefined) targetConsole.error = originalConsoleError
      if (originalConsoleWarn !== undefined) targetConsole.warn = originalConsoleWarn
    }
    if (targetWindow !== undefined) {
      if (originalWindowFetch !== undefined) targetWindow.fetch = originalWindowFetch
      targetWindow.removeEventListener?.("error", onErrorListener as EventListener)
      targetWindow.removeEventListener?.("unhandledrejection", onUnhandledRejectionListener as EventListener)
      targetWindow.removeEventListener?.("pagehide", onPageHide as EventListener)
      targetWindow.removeEventListener?.("beforeunload", onBeforeUnload as EventListener)
      if (typeof targetWindow.document !== "undefined") {
        targetWindow.document.removeEventListener?.("visibilitychange", onVisibilityChange as EventListener)
      }
    }
    queue.length = 0
  }

  return {
    destroy,
    flush,
    isReporting: () => isSending,
    pendingCount: () => queue.length,
    record,
  }
}
