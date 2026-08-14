import type { RunFailureClass } from "../schema/runFailureClassSchema.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"

const retryableFailureCodes = new Set([
  "chat_adapter_error",
  "chat_interrupted",
  "provider_connection_failed",
  "provider_failed",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unavailable",
  "stream_disconnected",
  "stream_timeout",
])

export function runFailureClassResolve(failure: RunFailureMetadata): RunFailureClass {
  return retryableFailureCodes.has(failure.code) ? "retryable" : "terminal"
}
