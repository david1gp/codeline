import type { ConsoleMessage, Page, Request, TestInfo } from "@playwright/test"
import { apiClientLogSanitize } from "../src/api/diagnostics/apiClientLogSanitize.js"

type BrowserDiagnostic =
  | {
      columnNumber: number
      kind: "console"
      level: string
      lineNumber: number
      message: string
      url: string
    }
  | {
      kind: "pageerror"
      message: string
      stack: string
    }
  | {
      errorText: string
      kind: "requestfailed"
      message: string
      method: string
      url: string
    }

type BrowserDiagnosticArtifact = BrowserDiagnostic & { expected: boolean }

type BrowserDiagnosticsOptions = {
  expected?: (diagnostic: BrowserDiagnostic) => boolean
}

function diagnosticStringSanitize(value: string): string {
  const sanitized = apiClientLogSanitize(value)
  return typeof sanitized === "string" ? sanitized : "[UNSERIALIZABLE]"
}

function consoleDiagnosticCreate(message: ConsoleMessage): BrowserDiagnostic {
  const location = message.location()
  return {
    columnNumber: location.columnNumber,
    kind: "console",
    level: message.type(),
    lineNumber: location.lineNumber,
    message: diagnosticStringSanitize(message.text()),
    url: diagnosticStringSanitize(location.url),
  }
}

function pageErrorDiagnosticCreate(error: Error): BrowserDiagnostic {
  return {
    kind: "pageerror",
    message: diagnosticStringSanitize(error.message || String(error)),
    stack: diagnosticStringSanitize(error.stack ?? ""),
  }
}

function requestFailedDiagnosticCreate(request: Request): BrowserDiagnostic {
  const failure = request.failure()
  const errorText = failure?.errorText ?? "Request failed"
  return {
    errorText: diagnosticStringSanitize(errorText),
    kind: "requestfailed",
    message: `${request.method()} ${diagnosticStringSanitize(request.url())}: ${diagnosticStringSanitize(errorText)}`,
    method: request.method(),
    url: diagnosticStringSanitize(request.url()),
  }
}

function diagnosticIsUnexpected(diagnostic: BrowserDiagnostic): boolean {
  return diagnostic.kind !== "console" || diagnostic.level === "error"
}

export function e2eBrowserDiagnosticsInstall(page: Page, testInfo: TestInfo, options: BrowserDiagnosticsOptions = {}) {
  const events: BrowserDiagnosticArtifact[] = []
  const unexpected: BrowserDiagnosticArtifact[] = []
  let destroyed = false
  let attached = false

  const record = (diagnostic: BrowserDiagnostic): void => {
    let expected = false
    try {
      expected = options.expected?.(diagnostic) ?? false
    } catch (_error) {
      expected = false
    }
    const event = { ...diagnostic, expected }
    events.push(event)
    if (!expected && diagnosticIsUnexpected(diagnostic)) unexpected.push(event)
    console.log(`[browser-diagnostics] ${JSON.stringify(event)}`)
  }

  const onConsole = (message: ConsoleMessage): void => {
    record(consoleDiagnosticCreate(message))
  }
  const onPageError = (error: Error): void => {
    record(pageErrorDiagnosticCreate(error))
  }
  const onRequestFailed = (request: Request): void => {
    record(requestFailedDiagnosticCreate(request))
  }

  page.on("console", onConsole)
  page.on("pageerror", onPageError)
  page.on("requestfailed", onRequestFailed)

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    page.off("console", onConsole)
    page.off("pageerror", onPageError)
    page.off("requestfailed", onRequestFailed)
  }

  const attach = async (): Promise<void> => {
    if (attached) return
    attached = true
    await testInfo.attach("browser-diagnostics", {
      body: JSON.stringify({ events, unexpected }, null, 2),
      contentType: "application/json",
    })
  }

  const assertNoUnexpected = (): void => {
    if (unexpected.length === 0) return
    const details = unexpected.map((event) => JSON.stringify(event)).join("\n")
    throw new Error(`Unexpected browser diagnostics (${unexpected.length}):\n${details}`)
  }

  const finalize = async (): Promise<void> => {
    destroy()
    await attach()
    assertNoUnexpected()
  }

  return { assertNoUnexpected, attach, destroy, finalize }
}
