import { describe, expect, it } from "bun:test"
import { createResultErrorCode } from "@adaptive-ds/result"
import { cliServerRun } from "../../src/cli/cliServerRun.js"

describe("cliServerRun", () => {
  it("cancels an ambiguously submitted run and preserves the submission error when cancellation is rejected", async () => {
    const submissionError = createResultErrorCode("chat", "The request could not be completed.", "network_error")
    let submittedRunId = ""
    let cancelledRunId = ""
    const transport = {
      chatSubmit: async (_sessionId: string, body: { runId: string }) => {
        submittedRunId = body.runId
        return submissionError
      },
      runCancel: async (_sessionId: string, runId: string, signal: AbortSignal) => {
        cancelledRunId = runId
        expect(signal.aborted).toBe(false)
        return createResultErrorCode("cancel", "private cancellation details", "network_error")
      },
    } as unknown as Parameters<typeof cliServerRun>[0]

    const result = await cliServerRun(transport, {
      onText: () => {},
      prompt: "hello",
      session: "session-1",
      signal: new AbortController().signal,
    })

    expect(submittedRunId).not.toBe("")
    expect(cancelledRunId).toBe(submittedRunId)
    expect(result).toBe(submissionError)
    expect(result).not.toHaveProperty("errorMessage", "private cancellation details")
  })

  it("does not cancel after a definite client rejection", async () => {
    const submissionError = Object.assign(
      createResultErrorCode("chat", "The request was rejected.", "invalid_request"),
      { statusCode: 400 },
    )
    let cancelCalled = false
    const transport = {
      chatSubmit: async () => submissionError,
      runCancel: async () => {
        cancelCalled = true
        return createResultErrorCode("cancel", "", "network_error")
      },
    } as unknown as Parameters<typeof cliServerRun>[0]

    const result = await cliServerRun(transport, {
      onText: () => {},
      prompt: "hello",
      session: "session-1",
      signal: new AbortController().signal,
    })

    expect(result).toBe(submissionError)
    expect(cancelCalled).toBe(false)
  })
})
