import { EventType, type StreamChunk } from "@tanstack/ai"
import { runFailureClassResolve } from "../../run/actions/runFailureClassResolve.js"

export function streamReplayErrorRetryableResolve(chunk: StreamChunk): boolean {
  return (
    chunk.type === EventType.RUN_ERROR &&
    chunk.code !== undefined &&
    runFailureClassResolve({ code: chunk.code, message: chunk.message ?? "The provider reported a failed run." }) ===
      "retryable"
  )
}
