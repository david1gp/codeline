import { expect, test } from "bun:test"
import { pwaServiceWorkerFetchHandle } from "../src/ui/pwa/pwaServiceWorkerFetchHandle.js"

const origin = "https://codeline.work"
const shellCacheName = "codeline-shell-v1"

type CacheCalls = {
  match: number
  open: number
  put: number
}

function dependenciesCreate(options: {
  calls: CacheCalls
  cached?: Response
  fetchResponse?: Response
  fetchError?: Error
}) {
  const { calls, cached, fetchResponse = new Response("network"), fetchError } = options
  const requests: Request[] = []
  const cache = {
    put: async () => {
      calls.put += 1
    },
  }

  return {
    requests,
    dependencies: {
      caches: {
        match: async () => {
          calls.match += 1
          return cached
        },
        open: async () => {
          calls.open += 1
          return cache
        },
      },
      fetch: async (request: Request) => {
        requests.push(request)
        if (fetchError) throw fetchError
        return fetchResponse
      },
      scopeOrigin: origin,
      shellCacheName,
    },
  }
}

test.each([
  ["GET", "/api/sessions?cursor=opaque-cursor"],
  ["GET", "/api/events"],
  ["GET", "/api/events?after=opaque-cursor"],
  ["GET", "/api/auth/login?returnTo=%2Ffiles"],
  ["POST", "/api/sessions"],
  ["PATCH", "/api/sessions/session-1"],
  ["DELETE", "/api/sessions/session-1"],
] as const)("keeps %s %s network-only", async (method, path) => {
  const calls = { match: 0, open: 0, put: 0 }
  const { dependencies, requests } = dependenciesCreate({ calls })
  const response = await pwaServiceWorkerFetchHandle(new Request(`${origin}${path}`, { method }), dependencies)

  expect(response?.status).toBe(200)
  expect(requests).toHaveLength(1)
  expect(calls).toEqual({ match: 0, open: 0, put: 0 })
})

test("does not use the navigation fallback for an API request", async () => {
  const calls = { match: 0, open: 0, put: 0 }
  const { dependencies } = dependenciesCreate({
    calls,
    cached: new Response("cached shell"),
    fetchError: new Error("offline"),
  })
  const request = new Request(`${origin}/api/events?after=opaque-cursor`, { mode: "navigate" })
  const response = pwaServiceWorkerFetchHandle(request, dependencies)

  expect(response).toBeDefined()
  await expect(response).rejects.toThrow("offline")
  expect(calls).toEqual({ match: 0, open: 0, put: 0 })
})

test("keeps immutable assets cache-first and admits successful network responses", async () => {
  const cachedCalls = { match: 0, open: 0, put: 0 }
  const cachedAsset = new Response("cached asset")
  const cachedAssetDependencies = dependenciesCreate({ calls: cachedCalls, cached: cachedAsset })
  const cachedResponse = await pwaServiceWorkerFetchHandle(
    new Request(`${origin}/assets/app.js`),
    cachedAssetDependencies.dependencies,
  )

  expect(cachedResponse).toBe(cachedAsset)
  expect(cachedAssetDependencies.requests).toHaveLength(0)
  expect(cachedCalls).toEqual({ match: 1, open: 0, put: 0 })

  const networkCalls = { match: 0, open: 0, put: 0 }
  const networkAsset = new Response("network asset")
  Object.defineProperty(networkAsset, "type", { value: "basic" })
  const networkAssetDependencies = dependenciesCreate({ calls: networkCalls, fetchResponse: networkAsset })
  const networkResponse = await pwaServiceWorkerFetchHandle(
    new Request(`${origin}/assets/app.js`),
    networkAssetDependencies.dependencies,
  )

  expect(networkResponse).toBe(networkAsset)
  expect(networkAssetDependencies.requests).toHaveLength(1)
  expect(networkCalls).toEqual({ match: 1, open: 1, put: 1 })
})

test("keeps ordinary navigation network-first with shell fallback", async () => {
  const calls = { match: 0, open: 0, put: 0 }
  const shell = new Response("cached shell")
  const { dependencies } = dependenciesCreate({ calls, cached: shell, fetchError: new Error("offline") })
  const response = await pwaServiceWorkerFetchHandle(
    new Request(`${origin}/sessions`, { mode: "navigate" }),
    dependencies,
  )

  expect(response).toBe(shell)
  expect(calls).toEqual({ match: 1, open: 0, put: 0 })
})
