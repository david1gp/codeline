import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { webfetchToolCreate } from "../src/tools/runtime/webfetchToolCreate.js"

test("passes webfetch input and registry bounds to a typed executor", async () => {
  const calls: Array<{ input: unknown; options: unknown }> = []
  const tool = webfetchToolCreate({
    execute: async (input, options) => {
      calls.push({ input, options })
      return createResult({
        contentType: "text/plain",
        format: input.format,
        output: "ok",
        truncated: false,
        url: input.url,
      })
    },
    maxResponseBytes: 2048,
  })
  const signal = new AbortController().signal

  const result = await tool.execute(
    { outputLimit: 300, signal, timeoutMs: 400, toolCallId: "call-webfetch-1" },
    { format: "text", url: "https://example.test/page" },
  )

  expect(result).toMatchObject({ success: true, data: { output: "ok" } })
  expect(calls).toEqual([
    {
      input: { format: "text", url: "https://example.test/page" },
      options: { maxResponseBytes: 2048, outputLimit: 300, signal, timeoutMs: 400 },
    },
  ])
})

test("uses deterministic webfetch execution defaults when registry bounds are absent", async () => {
  let received: { outputLimit: number; signal: AbortSignal; timeoutMs: number | null } | undefined
  const tool = webfetchToolCreate({
    execute: async (_input, options) => {
      received = options
      return createResult({
        contentType: "text/plain",
        format: "markdown",
        output: "",
        truncated: false,
        url: "https://example.test/page",
      })
    },
  })
  const signal = new AbortController().signal

  await tool.execute(
    { signal, toolCallId: "call-webfetch-2" },
    { format: "markdown", url: "https://example.test/page" },
  )

  expect(received).toEqual({ outputLimit: 16_384, signal, timeoutMs: 30_000 })
})

test("runs the real webfetch executor through an injected deterministic fetch", async () => {
  let requestUrl = ""
  const tool = webfetchToolCreate({
    fetch: async (input, init) => {
      requestUrl = typeof input === "string" ? input : input.toString()
      expect(init).toMatchObject({ redirect: "follow" })
      return new Response("tool content", { headers: { "content-type": "text/plain" } })
    },
  })

  const result = await tool.execute(
    { outputLimit: 500, signal: new AbortController().signal, timeoutMs: null, toolCallId: "call-webfetch-3" },
    { format: "text", url: "https://example.test/tool" },
  )

  expect(result).toMatchObject({ success: true, data: { output: "tool content", truncated: false } })
  expect(requestUrl).toBe("https://example.test/tool")
})
