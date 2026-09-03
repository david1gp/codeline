import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const settledSessionId = "example-session-active-1"

type SseFrame = {
  data: Record<string, unknown>
  event: string
  id: string
}

type SseRead = {
  body: string
  elapsedMs: number
  frames: SseFrame[]
  heartbeat: boolean
  headers: Record<string, string>
  status: number
}

type SseReadCondition = "frames" | "frames-and-heartbeat" | "heartbeat"

type SseReadOptions = {
  condition?: SseReadCondition
  minimumFrames?: number
  timeoutMs?: number
}

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function sseRead(page: Page, path: string, options: SseReadOptions = {}): Promise<SseRead> {
  const condition = options.condition ?? "frames-and-heartbeat"
  const minimumFrames = options.minimumFrames ?? 0
  const timeoutMs = options.timeoutMs ?? 30_000
  return page.evaluate(
    async ({ condition: targetCondition, minimumFrames: target, path: requestPath, timeoutMs: timeout }) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        try {
          controller.abort()
        } catch {
          // Cleanup must not mask the stream assertion result.
        }
      }, timeout)
      const startedAt = performance.now()
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let readerActive = false
      let completed = false
      try {
        const response = await fetch(requestPath, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(
            `The managed event feed request failed with status ${response.status} ${response.statusText}.`,
          )
        }
        reader = response.body?.getReader()
        if (reader === undefined) throw new Error("The managed event feed has no readable body.")
        readerActive = true

        const decoder = new TextDecoder()
        const frames: SseFrame[] = []
        let body = ""
        let buffered = ""
        let pendingCarriageReturn = false
        let heartbeat = false

        const blockProcess = (block: string): void => {
          let event = "message"
          let id = ""
          const dataLines: string[] = []
          for (const line of block.split("\n")) {
            if (line.startsWith(":")) {
              if (line.slice(1).trim() === "heartbeat") heartbeat = true
              continue
            }

            const separator = line.indexOf(":")
            const field = separator < 0 ? line : line.slice(0, separator)
            let value = separator < 0 ? "" : line.slice(separator + 1)
            if (value.startsWith(" ")) value = value.slice(1)
            if (field === "event") event = value
            else if (field === "id") id = value
            else if (field === "data") dataLines.push(value)
          }
          if (dataLines.length === 0 || frames.length >= target) return
          frames.push({ data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>, event, id })
        }

        const blocksProcess = (): void => {
          let separator = buffered.indexOf("\n\n")
          while (separator >= 0) {
            blockProcess(buffered.slice(0, separator))
            buffered = buffered.slice(separator + 2)
            separator = buffered.indexOf("\n\n")
          }
        }

        const textAppend = (text: string): void => {
          if (pendingCarriageReturn) {
            buffered += "\n"
            pendingCarriageReturn = false
            if (text.startsWith("\n")) text = text.slice(1)
          }
          if (text.endsWith("\r")) {
            pendingCarriageReturn = true
            text = text.slice(0, -1)
          }
          buffered += text.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
          blocksProcess()
        }

        const conditionSatisfied = (): boolean => {
          if (targetCondition === "heartbeat") return heartbeat
          if (targetCondition === "frames") return frames.length >= target
          return frames.length >= target && heartbeat
        }

        while (!conditionSatisfied()) {
          const next = await reader.read()
          if (next.done || next.value === undefined) {
            readerActive = false
            const text = decoder.decode()
            body += text
            textAppend(text)
            if (pendingCarriageReturn) {
              buffered += "\n"
              pendingCarriageReturn = false
              blocksProcess()
            }
            break
          }
          const text = decoder.decode(next.value, { stream: true })
          body += text
          textAppend(text)
        }

        if (!conditionSatisfied()) {
          const targetDescription =
            targetCondition === "heartbeat"
              ? "its heartbeat"
              : targetCondition === "frames"
                ? `${target} frame${target === 1 ? "" : "s"}`
                : `${target} frame${target === 1 ? "" : "s"} and its heartbeat`
          throw new Error(`The managed event feed closed before ${targetDescription}.`)
        }

        const result = {
          body,
          elapsedMs: performance.now() - startedAt,
          frames,
          heartbeat,
          headers: Object.fromEntries(response.headers.entries()),
          status: response.status,
        }
        completed = true
        return result
      } catch (error) {
        if (!completed && readerActive && !controller.signal.aborted) {
          try {
            controller.abort()
          } catch {
            // Cleanup must not mask the stream assertion result.
          }
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
        if (reader !== undefined) {
          try {
            await reader.cancel()
            readerActive = false
          } catch {
            // Cleanup must not mask the stream assertion result.
          }
        }
      }
    },
    { condition, minimumFrames, path, timeoutMs },
  )
}

test("the managed public origin streams SSE and serves compressed bounded snapshots", async ({ browser }) => {
  test.setTimeout(90_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let cleanupError: unknown
  let deletedUserIds: string[] = []

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })
    context = await memberContextOpen(browser, member.token)

    const page = await context.newPage()
    await page.goto("/api/health")
    const sse = await sseRead(page, "/api/events", { condition: "heartbeat", timeoutMs: 45_000 })
    expect(sse.status, sse.body).toBe(200)
    expect(sse.headers["cache-control"]).toBe("no-cache, no-transform")
    expect(sse.headers["content-type"]).toContain("text/event-stream")
    expect(sse.headers["x-accel-buffering"]).toBe("no")
    expect(sse.body).toContain(": heartbeat")
    expect(sse.elapsedMs).toBeLessThan(45_000)

    const snapshot = await context.request.get(`${baseOrigin}/api/sessions/${settledSessionId}/bounded-snapshot`, {
      headers: { "Accept-Encoding": "gzip" },
    })
    expect(snapshot.status()).toBe(200)
    expect(snapshot.headers()["cache-control"]).toBe("private, no-cache")
    expect(snapshot.headers().vary).toBe("Cookie, Accept-Encoding")
    expect(snapshot.headers()["content-encoding"]).toBe("gzip")
    const snapshotBody = (await snapshot.json()) as {
      detailCursor: string
      latestAnswer: { content: string } | null
      semanticSteps: unknown[]
      session: { id: string }
      throughPosition: number
    }
    expect(snapshotBody.session.id).toBe(settledSessionId)
    expect(snapshotBody.detailCursor).toEqual(expect.any(String))
    expect(snapshotBody.throughPosition).toBeGreaterThan(0)
    expect(snapshotBody.semanticSteps.length).toBeGreaterThan(0)
    expect(snapshotBody.latestAnswer?.content).toBe("The workspace shell is ready for local sessions.")

    // Selected-session detail has its own route and cursor kind. Its replayed
    // entries carry mutable changePosition separately from immutable position.
    const selectedPath = `/api/sessions/${settledSessionId}/events`
    const selectedFrames = await sseRead(page, selectedPath, { condition: "frames", minimumFrames: 4 })
    expect(selectedFrames.status).toBe(200)
    expect(selectedFrames.headers["content-type"]).toContain("text/event-stream")
    expect(selectedFrames.frames).toHaveLength(4)
    const selectedChangePositions: number[] = []
    for (const frame of selectedFrames.frames) {
      expect(frame.event).toBe("entry")
      expect(frame.id).toBe(frame.data.id)
      expect(frame.data).toMatchObject({
        changePosition: expect.any(Number),
        entryId: expect.any(String),
        eventType: "entry",
        position: expect.any(Number),
        sessionId: settledSessionId,
      })
      const changePosition = frame.data.changePosition
      const position = frame.data.position
      if (typeof changePosition !== "number" || typeof position !== "number")
        throw new Error("The selected-session frame positions were not numeric.")
      expect(Number.isSafeInteger(changePosition)).toBe(true)
      expect(Number.isSafeInteger(position)).toBe(true)
      expect(changePosition).toBeGreaterThan(0)
      expect(position).toBeGreaterThan(0)
      expect(changePosition).toBeGreaterThanOrEqual(position)
      selectedChangePositions.push(changePosition)
    }
    expect(selectedChangePositions).toEqual([...selectedChangePositions].sort((left, right) => left - right))

    // The cursor returned by the bounded snapshot is sent as `after` on the
    // selected-session stream. The expired-cursor spec covers its reconnect/reset
    // lifecycle without opening a second broad browser flow here.
    const selectedCursorSse = await sseRead(
      page,
      `${selectedPath}?after=${encodeURIComponent(snapshotBody.detailCursor)}`,
      {
        condition: "heartbeat",
        timeoutMs: 45_000,
      },
    )
    expect(selectedCursorSse.status).toBe(200)
    expect(selectedCursorSse.headers["content-type"]).toContain("text/event-stream")
    expect(selectedCursorSse.body).toContain(": heartbeat")
    await page.close()
  } finally {
    await context?.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
      await e2eExampleDataSeedRestore()
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
