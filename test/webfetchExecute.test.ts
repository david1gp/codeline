import { expect, test } from "bun:test"
import { type WebfetchFetch, webfetchExecute } from "../src/tools/actions/webfetchExecute.js"
import { toolErrorCodes } from "../src/tools/runtime/toolErrorCodes.js"

const textEncoder = new TextEncoder()

function responseCreate(
  body: BodyInit | null,
  contentType: string,
  options: { finalUrl?: string; status?: number } = {},
): Response {
  const response = new Response(body, {
    headers: { "content-type": contentType },
    status: options.status ?? 200,
  })
  if (options.finalUrl !== undefined)
    Object.defineProperty(response, "url", { configurable: true, value: options.finalUrl })
  return response
}

function fetchResponseCreate(response: Response): {
  calls: Array<{ init: RequestInit | undefined; url: string }>
  fetch: WebfetchFetch
} {
  const calls: Array<{ init: RequestInit | undefined; url: string }> = []
  const fetch: WebfetchFetch = async (input, init) => {
    calls.push({ init, url: typeof input === "string" ? input : input.toString() })
    return response
  }
  return { calls, fetch }
}

function expectError(result: unknown, code: string, message?: string): void {
  expect(result).toMatchObject({ code, op: "webfetchExecute", success: false })
  if (message !== undefined) expect(result).toMatchObject({ errorMessage: message })
}

test("follows redirects through the fetch contract and returns textual content", async () => {
  const fixture = fetchResponseCreate(
    responseCreate("redirected content", "text/plain; charset=utf-8", {
      finalUrl: "https://target.example/final",
    }),
  )

  const result = await webfetchExecute(
    { format: "text", url: "  https://source.example/redirect  " },
    { fetch: fixture.fetch },
  )

  expect(result).toEqual({
    success: true,
    data: {
      contentType: "text/plain; charset=utf-8",
      format: "text",
      output: "redirected content",
      truncated: false,
      url: "https://source.example/redirect",
    },
  })
  expect(fixture.calls).toHaveLength(1)
  expect(fixture.calls[0]?.url).toBe("https://source.example/redirect")
  expect(fixture.calls[0]?.init).toMatchObject({ redirect: "follow" })
  expect(fixture.calls[0]?.init?.headers).toMatchObject({
    Accept: "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1",
  })
})

test("rejects malformed, non-HTTP, credential-bearing, and invalid inputs before fetch", async () => {
  let calls = 0
  const fetch: WebfetchFetch = async () => {
    calls += 1
    return responseCreate("must not be fetched", "text/plain")
  }

  for (const url of ["not a URL", "ftp://example.test/file", "https://user:password@example.test/private"]) {
    const result = await webfetchExecute({ url }, { fetch })
    expectError(result, toolErrorCodes.invalidUrl)
  }
  expectError(await webfetchExecute(null, { fetch }), toolErrorCodes.invalidInput)
  expectError(
    await webfetchExecute({ format: "xml", url: "https://example.test" }, { fetch }),
    toolErrorCodes.invalidInput,
  )
  expect(calls).toBe(0)
})

test("rejects an unsafe final redirect URL without reading its body", async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(textEncoder.encode("must not be read"))
    },
    cancel() {
      cancelled = true
    },
  })

  const result = await webfetchExecute(
    { url: "https://example.test/redirect" },
    {
      fetch: async () => {
        const response = new Response(body, { headers: { "content-type": "text/plain" } })
        Object.defineProperty(response, "url", { configurable: true, value: "ftp://example.test/final" })
        return response
      },
    },
  )

  expectError(result, toolErrorCodes.invalidUrl, "The webfetch URL must use HTTP or HTTPS.")
  expect(cancelled).toBe(true)
})

test("rejects unsupported content and HTTP failures with structured errors", async () => {
  let unsupportedCancelled = false
  const unsupportedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(textEncoder.encode("binary"))
    },
    cancel() {
      unsupportedCancelled = true
    },
  })
  const unsupported = await webfetchExecute(
    { url: "https://example.test/image.png" },
    { fetch: async () => new Response(unsupportedBody, { headers: { "content-type": "image/png" } }) },
  )
  expectError(unsupported, toolErrorCodes.unsupportedContentType, "The fetched content type is not textual.")
  expect(unsupportedCancelled).toBe(true)

  const httpError = await webfetchExecute(
    { url: "https://example.test/missing" },
    { fetch: async () => responseCreate("not found", "text/plain", { status: 404 }) },
  )
  expectError(httpError, toolErrorCodes.httpError, "The webfetch request returned HTTP status 404.")

  const fetchFailure = await webfetchExecute(
    { url: "https://example.test/failure" },
    { fetch: async () => Promise.reject(new Error("private fetch detail")) },
  )
  expectError(fetchFailure, toolErrorCodes.fetchFailed, "The webfetch request failed.")
  expect(JSON.stringify(fetchFailure)).not.toContain("private fetch detail")
})

test("converts HTML to text, Markdown, or leaves it as HTML", async () => {
  const html = `<!doctype html>
<html><head><title>ignored</title><style>.hidden { display: none }</style></head>
<body><h1>Hello &amp; world</h1><p>Para <strong>bold</strong> and <a href="https://example.test/link">link</a>.</p>
<ul><li>One</li><li>Two</li></ul><pre><code>const value = 1;</code></pre><script>ignored()</script></body></html>`
  const fetch: WebfetchFetch = async () => responseCreate(html, "text/html; charset=utf-8")

  const text = await webfetchExecute({ format: "text", url: "https://example.test/page" }, { fetch })
  expect(text).toEqual({
    success: true,
    data: {
      contentType: "text/html; charset=utf-8",
      format: "text",
      output: "ignored\n\nHello & world\n\nPara bold and link.\n\nOne\n\nTwo\n\nconst value = 1;",
      truncated: false,
      url: "https://example.test/page",
    },
  })

  const markdown = await webfetchExecute({ format: "markdown", url: "https://example.test/page" }, { fetch })
  expect(markdown).toEqual({
    success: true,
    data: {
      contentType: "text/html; charset=utf-8",
      format: "markdown",
      output:
        "ignored\n\n# Hello & world\n\nPara **bold** and [link](https://example.test/link).\n\n- One\n- Two\n\n```\nconst value = 1;\n```",
      truncated: false,
      url: "https://example.test/page",
    },
  })

  const rawHtml = await webfetchExecute({ format: "html", url: "https://example.test/page" }, { fetch })
  expect(rawHtml).toEqual({
    success: true,
    data: {
      contentType: "text/html; charset=utf-8",
      format: "html",
      output: html,
      truncated: false,
      url: "https://example.test/page",
    },
  })
})

test("returns deterministic timeout and cancellation errors and aborts fetch signals", async () => {
  let timeoutSignal: AbortSignal | undefined
  const timeout = await webfetchExecute(
    { url: "https://example.test/slow" },
    {
      fetch: async (_input, init) => {
        timeoutSignal = init?.signal ?? undefined
        return new Promise<Response>(() => undefined)
      },
      timeoutMs: 1,
    },
  )
  expectError(timeout, toolErrorCodes.timeout, "The webfetch request timed out.")
  expect(timeoutSignal?.aborted).toBe(true)

  const controller = new AbortController()
  let cancellationSignal: AbortSignal | undefined
  const cancellationExecution = webfetchExecute(
    { url: "https://example.test/cancel" },
    {
      fetch: async (_input, init) => {
        cancellationSignal = init?.signal ?? undefined
        return new Promise<Response>(() => undefined)
      },
      signal: controller.signal,
      timeoutMs: null,
    },
  )
  controller.abort("user-requested")
  const cancelled = await cancellationExecution
  expectError(cancelled, toolErrorCodes.aborted, "The webfetch request was aborted.")
  expect(cancellationSignal?.aborted).toBe(true)
})

test("uses the input timeout and preserves timeout precedence over a later cancellation", async () => {
  const controller = new AbortController()
  const execution = webfetchExecute(
    { timeout: 0.001, url: "https://example.test/input-timeout" },
    {
      fetch: async () => new Promise<Response>(() => undefined),
      signal: controller.signal,
      timeoutMs: null,
    },
  )
  setTimeout(() => controller.abort("cancelled-after-timeout"), 10)

  expectError(await execution, toolErrorCodes.timeout, "The webfetch request timed out.")
})

test("returns cancellation while a response body is waiting and cancels the reader", async () => {
  const controller = new AbortController()
  let cancelled = false
  let readingResolve: (() => void) | undefined
  const reading = new Promise<void>((resolve) => {
    readingResolve = resolve
  })
  const response = {
    body: {
      getReader: () => ({
        cancel: async () => {
          cancelled = true
        },
        read: async () => {
          readingResolve?.()
          return new Promise<never>(() => undefined)
        },
        releaseLock: () => undefined,
      }),
    },
    headers: new Headers({ "content-type": "text/plain" }),
    ok: true,
    status: 200,
    url: "https://example.test/body-cancel",
  } as unknown as Response
  const execution = webfetchExecute(
    { url: "https://example.test/body-cancel" },
    {
      fetch: async () => response,
      signal: controller.signal,
      timeoutMs: null,
    },
  )
  await reading
  controller.abort("user-requested")

  expectError(await execution, toolErrorCodes.aborted, "The webfetch request was aborted.")
  expect(cancelled).toBe(true)
})

test("rejects an oversized response and truncates oversized structured output", async () => {
  let responseCancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(textEncoder.encode("123456"))
    },
    cancel() {
      responseCancelled = true
    },
  })
  const oversized = await webfetchExecute(
    { url: "https://example.test/large" },
    { fetch: async () => new Response(body, { headers: { "content-type": "text/plain" } }), maxResponseBytes: 5 },
  )
  expectError(oversized, toolErrorCodes.responseTooLarge, "The fetched response exceeded the byte limit.")
  expect(responseCancelled).toBe(true)

  const output = await webfetchExecute(
    { format: "text", url: "https://example.test/output" },
    { fetch: async () => responseCreate("x".repeat(1_000), "text/plain"), outputLimit: 120 },
  )
  expect(output.success).toBe(true)
  if (!output.success) return
  expect(output.data.truncated).toBe(true)
  expect(output.data.output.length).toBeLessThan(1_000)
  expect(JSON.stringify(output.data).length).toBeLessThanOrEqual(120)
})

test("rejects a response using Content-Length before consuming its body", async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(textEncoder.encode("body"))
    },
    cancel() {
      cancelled = true
    },
  })
  const result = await webfetchExecute(
    { url: "https://example.test/content-length" },
    {
      fetch: async () =>
        new Response(body, {
          headers: { "content-length": "6", "content-type": "text/plain" },
        }),
      maxResponseBytes: 5,
    },
  )

  expectError(result, toolErrorCodes.responseTooLarge, "The fetched response exceeded the byte limit.")
  expect(cancelled).toBe(true)
})

test("reports deterministic response-body read and malformed-chunk failures", async () => {
  const failedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("private body failure"))
    },
  })
  const failed = await webfetchExecute(
    { url: "https://example.test/body-failure" },
    { fetch: async () => new Response(failedBody, { headers: { "content-type": "text/plain" } }) },
  )
  expectError(failed, toolErrorCodes.fetchFailed, "The fetched response could not be read.")
  expect(JSON.stringify(failed)).not.toContain("private body failure")

  const malformedResponse = {
    body: {
      getReader: () => ({
        read: async () => ({ done: false, value: "not bytes" }),
        releaseLock: () => undefined,
      }),
    },
    headers: new Headers({ "content-type": "text/plain" }),
    ok: true,
    status: 200,
    url: "https://example.test/malformed-chunk",
  } as unknown as Response
  const malformed = await webfetchExecute({ url: malformedResponse.url }, { fetch: async () => malformedResponse })
  expectError(malformed, toolErrorCodes.fetchFailed, "The fetched response could not be read.")
})

test("rejects pre-aborted execution and invalid execution bounds before fetch", async () => {
  const controller = new AbortController()
  controller.abort("already-cancelled")
  let calls = 0
  const fetch: WebfetchFetch = async () => {
    calls += 1
    return responseCreate("must not fetch", "text/plain")
  }

  expectError(
    await webfetchExecute({ url: "https://example.test/pre-aborted" }, { fetch, signal: controller.signal }),
    toolErrorCodes.aborted,
  )
  expectError(
    await webfetchExecute({ url: "https://example.test/invalid-limit" }, { fetch, outputLimit: 0 }),
    toolErrorCodes.invalidContext,
  )
  expectError(
    await webfetchExecute({ url: "https://example.test/invalid-timeout" }, { fetch, timeoutMs: 0 }),
    toolErrorCodes.invalidContext,
  )
  expect(calls).toBe(0)
})
