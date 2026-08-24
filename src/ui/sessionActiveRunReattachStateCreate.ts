import { createEffect, onCleanup } from "solid-js"
import { runActiveListFetch } from "../run/ui/runActiveListFetch.js"
import { runActiveSnapshotFetch } from "../run/ui/runActiveSnapshotFetch.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionActiveRunReattachOptions = {
  /**
   * Applies the run-specific snapshot to the shared feed state and attaches the
   * feed after the snapshot's cursor. Supplied by the event-feed coordinator.
   */
  activeRunAttach: (input: {
    lastCursor: string | null
    lastSequence: number
    partialText: string
    runId: string
    sessionId: string
    status: string
  }) => void
  enabled?: () => boolean
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionId: () => string | null
}

export type SessionActiveRunReattachStatus = "attached" | "error" | "idle" | "loading" | "none"

/**
 * Reload path for a detached run. The reloaded tab holds no client run state, so
 * it discovers the session's active runs over HTTP, reads each run-specific
 * active snapshot from one consistent server snapshot, and only then attaches
 * `/api/events` after the returned cursor. Partial output is never reconstructed
 * by replaying from an arbitrary old cursor.
 */
export function sessionActiveRunReattachStateCreate(options: SessionActiveRunReattachOptions) {
  const status = signalObjectCreate<SessionActiveRunReattachStatus>("idle")
  const runIds = signalObjectCreate<readonly string[]>([])

  createEffect(() => {
    const sessionId = options.sessionId()
    const enabled = options.enabled?.() ?? true
    let disposed = false
    onCleanup(() => {
      disposed = true
    })

    runIds.set([])
    if (sessionId === null || !enabled) {
      status.set("idle")
      return
    }

    status.set("loading")
    void (async () => {
      const listed = await runActiveListFetch(sessionId, {
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      })
      if (disposed) return
      if (!listed.success) {
        status.set("error")
        return
      }
      if (listed.data.runs.length === 0) {
        status.set("none")
        return
      }

      const attached: string[] = []
      for (const run of listed.data.runs) {
        const snapshot = await runActiveSnapshotFetch(sessionId, run.runId, {
          ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        })
        if (disposed) return
        if (!snapshot.success) {
          status.set("error")
          return
        }
        options.activeRunAttach({
          lastCursor: snapshot.data.lastCursor ?? null,
          lastSequence: snapshot.data.lastSequence,
          partialText: snapshot.data.partialText,
          runId: run.runId,
          sessionId,
          status: snapshot.data.status,
        })
        attached.push(run.runId)
      }
      if (disposed) return
      runIds.set(attached)
      status.set("attached")
    })()
  })

  return { runIds: runIds.get, status: status.get }
}
