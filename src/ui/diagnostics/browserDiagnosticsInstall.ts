import {
  type BrowserDiagnosticsCollector,
  type BrowserDiagnosticsCollectorOptions,
  browserDiagnosticsCollectorCreate,
} from "./browserDiagnosticsCollectorCreate.js"

let installedCollector: BrowserDiagnosticsCollector | undefined

export function browserDiagnosticsInstall(
  options: BrowserDiagnosticsCollectorOptions = {},
): BrowserDiagnosticsCollector | undefined {
  if (typeof window === "undefined") return undefined
  if (installedCollector !== undefined) return installedCollector

  installedCollector = browserDiagnosticsCollectorCreate({
    console: options.console ?? window.console,
    endpoint: options.endpoint ?? "/api/diagnostics/logs",
    fetch: options.fetch ?? window.fetch.bind(window),
    window: options.window ?? window,
    ...options,
  })

  return installedCollector
}
