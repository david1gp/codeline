import { expect, test } from "bun:test"
import { browserDiagnosticsCollectorCreate } from "../src/ui/diagnostics/browserDiagnosticsCollectorCreate.js"

type MockFetchCall = {
  body: string | undefined
  headers: HeadersInit | undefined
  method: string | undefined
  url: string
}

test("browserDiagnosticsCollectorCreate captures console.error and console.warn while preserving console output", async () => {
  const consoleCalls: { level: string; args: unknown[] }[] = []
  const fetchCalls: MockFetchCall[] = []

  const mockConsole = {
    error: (...args: unknown[]) => {
      consoleCalls.push({ args, level: "error" })
    },
    warn: (...args: unknown[]) => {
      consoleCalls.push({ args, level: "warn" })
    },
  } as unknown as Console

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    fetchCalls.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: init?.headers,
      method: init?.method,
      url: String(input),
    })
    return new Response(JSON.stringify({ accepted: 1 }), { status: 200 })
  }

  const collector = browserDiagnosticsCollectorCreate({
    batchSize: 10,
    console: mockConsole,
    fetch: mockFetch,
    flushIntervalMs: 10000,
    now: () => 1724716800000,
  })

  mockConsole.error("Something went wrong", new Error("Internal failure"))
  mockConsole.warn("Warning: slow connection")

  // Console calls should have been preserved
  expect(consoleCalls).toHaveLength(2)
  expect(consoleCalls[0]?.level).toBe("error")
  expect(consoleCalls[1]?.level).toBe("warn")

  // Pending count should be 2
  expect(collector.pendingCount()).toBe(2)

  await collector.flush()

  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0]?.url).toBe("/api/diagnostics/logs")
  expect(fetchCalls[0]?.method).toBe("POST")

  const parsedBody = JSON.parse(fetchCalls[0]?.body ?? "{}") as { logs: { level: string; message: string }[] }
  expect(parsedBody.logs).toHaveLength(2)
  expect(parsedBody.logs[0]?.level).toBe("error")
  expect(parsedBody.logs[0]?.message).toContain("Something went wrong")
  expect(parsedBody.logs[1]?.level).toBe("warn")
  expect(parsedBody.logs[1]?.message).toContain("Warning: slow connection")

  collector.destroy()
})

test("browserDiagnosticsCollectorCreate captures uncaught window errors and unhandled rejections", async () => {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const fetchCalls: MockFetchCall[] = []

  const mockWindow = {
    addEventListener: (event: string, handler: (e: unknown) => void) => {
      listeners[event] = listeners[event] ?? []
      listeners[event]?.push(handler)
    },
    location: { href: "https://codeline.test/workspace/session-1" },
    removeEventListener: (event: string, handler: (e: unknown) => void) => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler)
    },
  } as unknown as Window & typeof globalThis

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    fetchCalls.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: init?.headers,
      method: init?.method,
      url: String(input),
    })
    return new Response(JSON.stringify({ accepted: 1 }), { status: 200 })
  }

  const collector = browserDiagnosticsCollectorCreate({
    batchSize: 10,
    fetch: mockFetch,
    window: mockWindow,
  })

  // Trigger error event
  const errorHandlers = listeners.error ?? []
  for (const handler of errorHandlers) {
    handler({
      colno: 4,
      error: new Error("Uncaught DOM failure"),
      filename: "app.js",
      lineno: 42,
      message: "Uncaught DOM failure",
    })
  }

  // Trigger unhandled rejection event
  const rejectionHandlers = listeners.unhandledrejection ?? []
  for (const handler of rejectionHandlers) {
    handler({
      reason: new Error("Rejected promise error"),
    })
  }

  expect(collector.pendingCount()).toBe(2)

  await collector.flush()

  expect(fetchCalls).toHaveLength(1)
  const parsed = JSON.parse(fetchCalls[0]?.body ?? "{}") as { logs: { level: string; source?: string; url?: string }[] }
  expect(parsed.logs[0]?.level).toBe("error")
  expect(parsed.logs[0]?.source).toBe("app.js:42:4")
  expect(parsed.logs[0]?.url).toBe("https://codeline.test/workspace/session-1")

  expect(parsed.logs[1]?.level).toBe("error")
  expect(parsed.logs[1]?.source).toBe("unhandledrejection")

  collector.destroy()
})

test("browserDiagnosticsCollectorCreate intercepts failed fetch requests without recursive reporting", async () => {
  const fetchCalls: MockFetchCall[] = []

  let backendHandler: (url: string, init?: RequestInit) => Promise<Response> = async (url) => {
    if (url.includes("/api/diagnostics/logs")) {
      return new Response(JSON.stringify({ accepted: 1 }), { status: 200 })
    }
    if (url.includes("/api/failing")) {
      return new Response("Not found", { status: 404, statusText: "Not Found" })
    }
    if (url.includes("/api/crash")) {
      throw new Error("Network connection dropped")
    }
    if (url.includes("/api/not-modified")) {
      return new Response(null, { status: 304 })
    }
    return new Response("ok", { status: 200 })
  }

  const originalWindowFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    fetchCalls.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: init?.headers,
      method: init?.method,
      url,
    })
    return backendHandler(url, init)
  }

  const mockWindow = {
    addEventListener: () => undefined,
    fetch: originalWindowFetch,
    location: { href: "https://codeline.test/sessions" },
    removeEventListener: () => undefined,
  } as unknown as Window & typeof globalThis

  const collector = browserDiagnosticsCollectorCreate({
    batchSize: 10,
    fetch: originalWindowFetch,
    window: mockWindow,
  })

  // Successful request -> not captured
  const res1 = await mockWindow.fetch("https://codeline.test/api/health")
  expect(res1.status).toBe(200)
  expect(collector.pendingCount()).toBe(0)

  // A conditional response is successful for the typed cache clients -> not captured
  const res304 = await mockWindow.fetch("https://codeline.test/api/not-modified")
  expect(res304.status).toBe(304)
  expect(collector.pendingCount()).toBe(0)

  // 404 request -> captured
  const res2 = await mockWindow.fetch("https://codeline.test/api/failing?secret=token#section")
  expect(res2.status).toBe(404)
  expect(collector.pendingCount()).toBe(1)

  // Thrown network error -> captured and rethrown
  await expect(mockWindow.fetch("https://codeline.test/api/crash")).rejects.toThrow("Network connection dropped")
  expect(collector.pendingCount()).toBe(2)

  // Flush calls /api/diagnostics/logs
  await collector.flush()

  // Verify /api/diagnostics/logs call itself is NOT recorded or recursed
  expect(collector.pendingCount()).toBe(0)

  // Check the recorded logs in the payload
  const diagCall = fetchCalls.find((call) => call.url.includes("/api/diagnostics/logs"))
  expect(diagCall).toBeDefined()
  const payload = JSON.parse(diagCall?.body ?? "{}") as { logs: { message: string; url?: string }[] }
  expect(payload.logs).toHaveLength(2)
  expect(payload.logs[0]?.message).toContain("404")
  expect(payload.logs[0]?.url).not.toContain("secret=token")
  expect(payload.logs[0]?.url).not.toContain("#section")
  expect(payload.logs[1]?.message).toContain("Network connection dropped")

  collector.destroy()
})

test("browserDiagnosticsCollectorCreate handles ingestion failure gracefully without infinite loops", async () => {
  let attempts = 0
  const mockFetch = async (): Promise<Response> => {
    attempts += 1
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const collector = browserDiagnosticsCollectorCreate({
    fetch: mockFetch,
  })

  collector.record({
    level: "error",
    message: "Initial test error",
  })

  expect(collector.pendingCount()).toBe(1)

  // Flush fails with 401, but does not throw or create secondary errors
  await collector.flush()

  expect(attempts).toBe(1)
  expect(collector.pendingCount()).toBe(0)

  collector.destroy()
})
