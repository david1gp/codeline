import { apiClientLogSanitize } from "../../api/diagnostics/apiClientLogSanitize.js"
import { apiDiagnosticsLimits } from "../../api/diagnostics/apiDiagnosticsLimits.js"
import type { BrowserDiagnosticEvent, BrowserDiagnosticEventInput } from "./browserDiagnosticEventSchema.js"

export function browserDiagnosticsEventSanitize(input: BrowserDiagnosticEventInput): BrowserDiagnosticEvent {
  const level =
    input.level === "warn" || input.level === "error" || input.level === "info" || input.level === "debug"
      ? input.level
      : "error"

  const rawMessage =
    typeof input.message === "string" && input.message.trim().length > 0 ? input.message : "Unknown diagnostic event"
  const sanitizedMessage =
    typeof apiClientLogSanitize(rawMessage) === "string"
      ? (apiClientLogSanitize(rawMessage) as string).trim()
      : "Unknown diagnostic event"
  const boundedMessage = sanitizedMessage.slice(0, apiDiagnosticsLimits.maxMessageLength) || "Unknown diagnostic event"

  const result: BrowserDiagnosticEvent = {
    level,
    message: boundedMessage,
  }

  if (typeof input.source === "string" && input.source.trim().length > 0) {
    const sanitized =
      typeof apiClientLogSanitize(input.source) === "string"
        ? (apiClientLogSanitize(input.source) as string).trim()
        : input.source.trim()
    result.source = sanitized.slice(0, apiDiagnosticsLimits.maxSourceLength)
  }

  if (typeof input.stack === "string" && input.stack.trim().length > 0) {
    const sanitized =
      typeof apiClientLogSanitize(input.stack) === "string"
        ? (apiClientLogSanitize(input.stack) as string).trim()
        : input.stack.trim()
    result.stack = sanitized.slice(0, apiDiagnosticsLimits.maxStackLength)
  }

  if (typeof input.url === "string" && input.url.trim().length > 0) {
    const sanitized =
      typeof apiClientLogSanitize(input.url) === "string"
        ? (apiClientLogSanitize(input.url) as string).trim()
        : input.url.trim()
    result.url = sanitized.slice(0, apiDiagnosticsLimits.maxUrlLength)
  }

  if (input.timestamp !== undefined) {
    if (typeof input.timestamp === "number" && Number.isSafeInteger(input.timestamp) && input.timestamp >= 0) {
      result.timestamp = input.timestamp
    } else if (typeof input.timestamp === "string" && input.timestamp.trim().length > 0) {
      result.timestamp = input.timestamp.trim().slice(0, apiDiagnosticsLimits.maxTimestampLength)
    }
  }

  if (input.data !== undefined) {
    result.data = apiClientLogSanitize(input.data)
  }

  return result
}
