import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"

export type StreamActivityFailure = {
  code: string
  message: string
}

type StreamChunkLike = {
  code?: unknown
  message?: unknown
  outcome?: unknown
  type: string
}

const abortCodes = new Set(["chat_aborted", "run_cancelled"])

function streamActivityFailureResolve(chunk: StreamChunkLike): StreamActivityFailure {
  return {
    code: typeof chunk.code === "string" ? chunk.code : "provider_failed",
    message: typeof chunk.message === "string" ? chunk.message : "The run failed.",
  }
}

/**
 * Track the run-level activity the TanStack message parts discard: thinking
 * spans, per-attempt starts (a retry emits another `RUN_STARTED` for the same
 * run) and terminal failure or abort chunks.
 */
export function streamActivityStateCreate() {
  const attemptCount = createSignalObject(0)
  const thinking = createSignalObject(false)
  const failures = createSignalObject<ReadonlyArray<StreamActivityFailure>>([])

  return {
    attemptCount: attemptCount.get,
    chunkObserve: (chunk: { type: string }) => {
      const candidate = chunk as StreamChunkLike
      if (candidate.type === "RUN_STARTED") {
        attemptCount.set(attemptCount.get() + 1)
        return
      }
      if (candidate.type === "REASONING_START" || candidate.type === "THINKING_START") {
        thinking.set(true)
        return
      }
      if (candidate.type === "REASONING_END" || candidate.type === "THINKING_END") {
        thinking.set(false)
        return
      }
      if (candidate.type === "RUN_FINISHED") {
        thinking.set(false)
        return
      }
      if (candidate.type !== "RUN_ERROR") return
      thinking.set(false)
      failures.set([...failures.get(), streamActivityFailureResolve(candidate)])
    },
    failures: failures.get,
    isAborted: () => failures.get().some((failure) => abortCodes.has(failure.code)),
    isThinking: thinking.get,
    turnReset: () => {
      attemptCount.set(0)
      thinking.set(false)
      failures.set([])
    },
  }
}

export type StreamActivityState = ReturnType<typeof streamActivityStateCreate>
