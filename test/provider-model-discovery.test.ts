import { expect, test } from "bun:test"
import { providerConnectionTest } from "../src/providers/runtime/providerConnectionTest.js"
import {
  type ProviderModelDiscoveryOptions,
  providerModelDiscovery,
} from "../src/providers/runtime/providerModelDiscovery.js"

const remoteConfiguration = {
  apiKey: "$CLIPROXYAPI_API_KEY",
  baseUrl: "https://provider.test/v1/",
  model: "gpt-test",
  provider: "cliproxyapi",
}

test("deterministic discovery and connection testing are local and network-free", async () => {
  let fetchCalls = 0
  const fetchImplementation: NonNullable<ProviderModelDiscoveryOptions["fetch"]> = async () => {
    fetchCalls += 1
    return new Response("should not be requested")
  }

  const discovered = await providerModelDiscovery(
    { model: "deterministic-test", provider: "deterministic" },
    { environment: {}, fetch: fetchImplementation },
  )
  expect(discovered).toEqual({ success: true, data: [{ id: "deterministic-test" }] })

  const tested = await providerConnectionTest(
    { model: "deterministic-test", provider: "deterministic" },
    { environment: {}, fetch: fetchImplementation },
  )
  expect(tested).toEqual({
    success: true,
    data: {
      discoveredModelCount: 1,
      model: "deterministic-test",
      modelAvailable: true,
      ok: true,
      provider: "deterministic",
    },
  })
  expect(fetchCalls).toBe(0)
})

test("remote discovery uses the injected request boundary and parses bounded model lists", async () => {
  const secret = "remote-secret-value"
  let requestUrl = ""
  let requestAuthorization = ""
  const fetchImplementation: NonNullable<ProviderModelDiscoveryOptions["fetch"]> = async (input, init) => {
    requestUrl = input.toString()
    requestAuthorization = new Headers(init?.headers).get("authorization") ?? ""
    return new Response(
      JSON.stringify({
        data: [{ id: "gpt-test" }, { id: "models/claude-test", display_name: "Claude Test" }, { id: "gpt-test" }],
      }),
      { headers: { "content-type": "application/json" } },
    )
  }

  const discovered = await providerModelDiscovery(remoteConfiguration, {
    environment: { CLIPROXYAPI_API_KEY: secret },
    fetch: fetchImplementation,
  })

  expect(discovered).toEqual({
    success: true,
    data: [{ id: "claude-test", name: "Claude Test" }, { id: "gpt-test" }],
  })
  expect(requestUrl).toBe("https://provider.test/v1/models")
  expect(requestAuthorization).toBe(`Bearer ${secret}`)
  expect(JSON.stringify(discovered)).not.toContain(secret)
})

test("connection testing reports unavailable configured models without exposing credentials", async () => {
  const secret = "connection-secret-value"
  const tested = await providerConnectionTest(remoteConfiguration, {
    environment: { CLIPROXYAPI_API_KEY: secret },
    fetch: async () => new Response(JSON.stringify({ data: [{ id: "other-model" }] })),
  })

  expect(tested).toEqual({
    success: true,
    data: {
      discoveredModelCount: 1,
      model: "gpt-test",
      modelAvailable: false,
      ok: false,
      provider: "cliproxyapi",
    },
  })
  expect(JSON.stringify(tested)).not.toContain(secret)
})

test("remote responses are bounded and failures stay redacted", async () => {
  const secret = "oversized-secret-value"
  let bodyRead = false
  const oversizedResponse = new Response("{}", {
    headers: { "content-length": "100" },
  })
  const oversized = await providerModelDiscovery(remoteConfiguration, {
    environment: { CLIPROXYAPI_API_KEY: secret },
    fetch: async () => {
      bodyRead = true
      return oversizedResponse
    },
    maxResponseBytes: 10,
  })
  expect(oversized.success).toBe(false)
  expect(bodyRead).toBe(true)
  if (!oversized.success) expect(JSON.stringify(oversized)).not.toContain(secret)

  const tooMany = await providerModelDiscovery(remoteConfiguration, {
    environment: { CLIPROXYAPI_API_KEY: secret },
    fetch: async () => new Response(JSON.stringify({ data: [{ id: "one" }, { id: "two" }] })),
    maxModels: 1,
  })
  expect(tooMany.success).toBe(false)
  if (!tooMany.success) expect(JSON.stringify(tooMany)).not.toContain(secret)
})

test("remote discovery times out while reading a stalled response body", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"data":['))
    },
  })
  const result = await providerModelDiscovery(remoteConfiguration, {
    environment: { CLIPROXYAPI_API_KEY: "body-timeout-secret" },
    fetch: async () => new Response(body),
    timeoutMs: 10,
  })

  expect(result).toEqual({
    success: false,
    op: "providerModelDiscovery",
    errorMessage: "Provider model discovery timed out.",
  })
})

test("invalid configurations, unavailable credentials, and absent fetch implementations fail safely", async () => {
  const invalid = await providerModelDiscovery({ model: "missing-provider" }, { environment: {} })
  expect(invalid.success).toBe(false)

  const missingSecret = await providerModelDiscovery(remoteConfiguration, { environment: {} })
  expect(missingSecret.success).toBe(false)
  if (!missingSecret.success) expect(JSON.stringify(missingSecret)).not.toContain("remote-secret-value")

  const missingFetch = await providerModelDiscovery(remoteConfiguration, {
    environment: { CLIPROXYAPI_API_KEY: "remote-secret-value" },
  })
  expect(missingFetch.success).toBe(false)
  if (!missingFetch.success) expect(JSON.stringify(missingFetch)).not.toContain("remote-secret-value")
})
