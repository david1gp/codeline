import { EventType, type StreamChunk } from "@tanstack/ai"

type TestingStreamScenario = "normal" | "error" | "unexpected-end" | "idle-timeout"

interface TestingStreamOptions {
  delayMs: number
  idleTimeoutMs: number
  scenario: TestingStreamScenario
  signal: AbortSignal
  cleanup?: () => void
}

function testingStreamRunEventCreate(type: EventType.RUN_STARTED | EventType.RUN_FINISHED): StreamChunk {
  if (type === EventType.RUN_STARTED) {
    return {
      type,
      threadId: "testing-thread",
      runId: "testing-run",
      timestamp: Date.now(),
    }
  }

  return {
    type,
    threadId: "testing-thread",
    runId: "testing-run",
    outcome: { type: "success" },
    timestamp: Date.now(),
  }
}

function testingStreamErrorEventCreate(message: string, code: string): StreamChunk {
  return {
    type: EventType.RUN_ERROR,
    code,
    message,
    timestamp: Date.now(),
  }
}

function testingStreamTextEventCreate(delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: "testing-message",
    delta,
    timestamp: Date.now(),
  }
}

async function testingStreamWait(options: TestingStreamOptions): Promise<"aborted" | "ready" | "stale"> {
  if (options.signal.aborted) return "aborted"

  return new Promise((resolve) => {
    const delayTimer = setTimeout(() => finish("ready"), options.delayMs)
    const staleTimer = setTimeout(() => finish("stale"), options.idleTimeoutMs)
    const finish = (result: "aborted" | "ready" | "stale") => {
      clearTimeout(delayTimer)
      clearTimeout(staleTimer)
      options.signal.removeEventListener("abort", onAbort)
      resolve(result)
    }
    const onAbort = () => {
      finish("aborted")
    }

    options.signal.addEventListener("abort", onAbort, { once: true })
  })
}

export function testingStreamCreate(options: TestingStreamOptions): AsyncIterable<StreamChunk> {
  return testingStreamGenerate(options)
}

async function* testingStreamGenerate(options: TestingStreamOptions): AsyncGenerator<StreamChunk> {
  try {
    yield testingStreamRunEventCreate(EventType.RUN_STARTED)

    const firstWait = await testingStreamWait(options)
    if (firstWait === "aborted") return
    if (firstWait === "stale") {
      yield testingStreamErrorEventCreate("The deterministic stream became idle.", "stream_idle_timeout")
      return
    }

    yield testingStreamTextEventCreate("deterministic ")

    if (options.scenario === "error") {
      yield testingStreamErrorEventCreate("The deterministic stream failed mid-stream.", "stream_test_error")
      return
    }

    if (options.scenario === "unexpected-end") return

    if (options.scenario === "idle-timeout") {
      const staleWait = await testingStreamWait({ ...options, delayMs: options.idleTimeoutMs + 1 })
      if (staleWait === "aborted") return
      yield testingStreamErrorEventCreate("The deterministic stream became idle.", "stream_idle_timeout")
      return
    }

    const secondWait = await testingStreamWait(options)
    if (secondWait === "aborted") return
    if (secondWait === "stale") {
      yield testingStreamErrorEventCreate("The deterministic stream became idle.", "stream_idle_timeout")
      return
    }

    yield testingStreamTextEventCreate("stream")
    yield testingStreamRunEventCreate(EventType.RUN_FINISHED)
  } finally {
    options.cleanup?.()
  }
}
