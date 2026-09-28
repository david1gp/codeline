import { createResult, createResultErrorCode, type Result, type ResultErr } from "@adaptive-ds/result"
import { uuidv7 } from "../uuid/uuidv7.js"
import { cliPollingDelay } from "./cliPollingDelay.js"
import type { cliServerTransportCreate } from "./cliServerTransportCreate.js"

type CliServerTransport = Extract<ReturnType<typeof cliServerTransportCreate>, { success: true }>["data"]
type CliServerRunOptions = {
  onText: (text: string) => void
  onSession?: (sessionId: string) => void
  pollingDelay?: typeof cliPollingDelay
  project?: string
  projectPath?: string
  target?: { serverId: string; agentId: string | undefined }
  prompt: string
  session?: string
  signal: AbortSignal
}

function cliServerRunError(message: string, code: string): ResultErr {
  return createResultErrorCode("cliServerRun", message, code)
}

function cliServerRunRequestSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(30_000)])
}

function cliServerRunFailureRetryable(result: ResultErr): boolean {
  if (result.code === "network_error") return true
  const status = result.statusCode
  return status !== undefined && ([408, 425, 429].includes(status) || (status >= 500 && status <= 599))
}

function cliServerRunSubmissionAmbiguous(result: ResultErr): boolean {
  const status = result.statusCode
  // A timeout can happen after admission. Other client errors are definite rejections.
  return status === undefined || status === 408 || status < 400 || status >= 500
}

async function cliServerRunSessionResolve(
  transport: CliServerTransport,
  options: CliServerRunOptions,
): Promise<Result<string>> {
  if (options.session !== undefined) return createResult(options.session)
  let serverId = options.target?.serverId
  let agentId = options.target?.agentId
  if (options.target === undefined) {
    const servers = await transport.serverList(cliServerRunRequestSignal(options.signal))
    if (!servers.success) return servers
    const server = servers.data.servers[0]
    if (server === undefined)
      return cliServerRunError("The server has no available execution targets.", "target_missing")
    const agents = await transport.agentList(server.id, cliServerRunRequestSignal(options.signal))
    if (!agents.success) return agents
    const agent = agents.data.agents.find(
      (candidate) =>
        candidate.serverId === server.id && candidate.parentAgentId === null && candidate.role === "primary",
    )
    if (agent === undefined) return cliServerRunError("The selected server has no primary agent.", "target_missing")
    serverId = server.id
    agentId = agent.id
  }
  if (serverId === undefined || agentId === undefined)
    return cliServerRunError(
      "The local runtime has no provisioned primary agent with available credentials.",
      "target_missing",
    )
  const created = await transport.sessionCreate(
    {
      clientRequestId: uuidv7(),
      primaryAgentId: agentId,
      ...(options.project === undefined ? {} : { projectId: options.project }),
      ...(options.projectPath === undefined ? {} : { projectPath: options.projectPath }),
      serverId,
      title: options.prompt.trim().slice(0, 500),
    },
    cliServerRunRequestSignal(options.signal),
  )
  if (!created.success) return created
  return createResult(created.data.session.id)
}

async function cliServerRunCancel(transport: CliServerTransport, sessionId: string, runId: string): Promise<ResultErr> {
  // Cancellation must not inherit the interrupted polling/admission signal.
  const cancelled = await transport.runCancel(sessionId, runId, AbortSignal.timeout(5_000))
  if (!cancelled.success)
    return cliServerRunError(`Interrupted; remote cancellation failed: ${cancelled.errorMessage}`, "interrupted")
  return cliServerRunError(
    cancelled.data.cancelledRunIds.length > 0
      ? "Interrupted; remote run cancellation requested."
      : "Interrupted; the remote run was already terminal.",
    "interrupted",
  )
}

export async function cliServerRun(transport: CliServerTransport, options: CliServerRunOptions): Promise<Result<void>> {
  if (options.signal.aborted) return cliServerRunError("Interrupted before starting a run.", "interrupted")
  if (options.prompt.trim().length === 0 || options.prompt.length > 100_000)
    return cliServerRunError("The prompt must contain text and be at most 100,000 characters.", "invalid_prompt")
  if (options.session !== undefined && (options.project !== undefined || options.projectPath !== undefined))
    return cliServerRunError(
      "Use --project for a new session, or --session for an existing session, not both.",
      "invalid_options",
    )

  const session = await cliServerRunSessionResolve(transport, options)
  if (!session.success) {
    if (options.signal.aborted) return cliServerRunError("Interrupted before starting a run.", "interrupted")
    return session
  }
  const sessionId = session.data
  options.onSession?.(sessionId)
  if (options.signal.aborted) return cliServerRunError("Interrupted before starting a run.", "interrupted")
  const clientRunId = uuidv7()
  // Let admission settle on Ctrl-C: aborting this POST can hide an admitted, detached run.
  // The client-generated ID still lets us cancel after an ambiguous admission failure.
  const submitted = await transport.chatSubmit(
    sessionId,
    { messages: [{ content: options.prompt, id: uuidv7(), role: "user" }], runId: clientRunId, threadId: sessionId },
    AbortSignal.timeout(30_000),
  )
  if (options.signal.aborted)
    return cliServerRunCancel(transport, sessionId, submitted.success ? submitted.data.runId : clientRunId)
  if (!submitted.success) {
    if (cliServerRunSubmissionAmbiguous(submitted)) {
      try {
        await transport.runCancel(sessionId, clientRunId, AbortSignal.timeout(5_000))
      } catch (_error) {
        // Keep the submission failure authoritative; cancellation is best-effort cleanup.
      }
    }
    return submitted
  }
  if (submitted.data.sessionId !== sessionId)
    return cliServerRunError("The chat response identifies a different session.", "invalid_response")
  // The API returns the durable run ID, which differs from our admission/idempotency ID.
  const runId = submitted.data.runId

  const delay = options.pollingDelay ?? cliPollingDelay
  let partialText = ""
  let retryAttempt = 0
  const textAppend = (nextText: string): Result<void> => {
    if (!nextText.startsWith(partialText))
      return cliServerRunError(
        "The run text is not append-only; a complete answer could not be recovered.",
        "run_snapshot_error",
      )
    const delta = nextText.slice(partialText.length)
    partialText = nextText
    if (delta.length > 0) options.onText(delta)
    return createResult(undefined)
  }

  for (;;) {
    if (options.signal.aborted) return cliServerRunCancel(transport, sessionId, runId)
    const snapshot = await transport.runSnapshot(sessionId, runId, cliServerRunRequestSignal(options.signal))
    if (options.signal.aborted) return cliServerRunCancel(transport, sessionId, runId)
    if (!snapshot.success) {
      if (!cliServerRunFailureRetryable(snapshot) || retryAttempt >= 6) return snapshot
      retryAttempt += 1
      await delay(options.signal, Math.min(100 * 2 ** (retryAttempt - 1), 1_600))
      continue
    }
    retryAttempt = 0
    if (snapshot.data.status === "failed" || snapshot.data.status === "aborted")
      return cliServerRunError(
        snapshot.data.failure?.message ?? `The remote run ${snapshot.data.status}.`,
        snapshot.data.failure?.code ?? "run_failed",
      )
    if (snapshot.data.status === "succeeded") {
      // Finalization clears active partialText atomically. Recover the final suffix (including
      // fast runs missed by polling) from the existing finalized HTTP detail, never global SSE.
      const detail = await transport.runDetail(sessionId, runId, cliServerRunRequestSignal(options.signal))
      if (options.signal.aborted) return cliServerRunCancel(transport, sessionId, runId)
      if (!detail.success) return detail
      if (
        detail.data.kind !== "finalized" ||
        detail.data.detail.run.id !== runId ||
        detail.data.detail.run.sessionId !== sessionId ||
        detail.data.detail.run.status !== "succeeded"
      )
        return cliServerRunError("The finalized answer is not available for this run.", "invalid_response")
      const answer = detail.data.detail.transcript.assistantText
      if (answer.startsWith("[Earlier output truncated]\n\n"))
        return cliServerRunError(
          "The server truncated the finalized answer; a complete answer could not be recovered.",
          "answer_truncated",
        )
      return textAppend(answer)
    }
    const appended = textAppend(snapshot.data.partialText)
    if (!appended.success) return appended
    await delay(options.signal, 100)
  }
}
