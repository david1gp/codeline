import { expect, mock, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import { httpQueryCacheCreate } from "../src/ui/httpQueryCacheCreate.js"

mock.module("solid-js", () => solidRuntime)

const { httpQueryStateCreate } = await import("../src/ui/httpQueryStateCreate.js")

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("http query loads for a key, exposes loading then complete, and stays idle without a key", async () => {
  await createRoot(async (dispose) => {
    const [key, keySet] = createSignal<string | undefined>(undefined)
    const loaded: string[] = []
    const state = httpQueryStateCreate<string>({
      key,
      load: async (current) => {
        loaded.push(current)
        return createResult(`value:${current}`)
      },
    })

    await tick()
    expect(loaded).toEqual([])
    expect(state.isIdle()).toBe(true)
    expect(state.isLoading()).toBe(false)
    expect(state.data()).toBeUndefined()

    keySet("a")
    expect(state.isLoading()).toBe(true)
    await tick()
    expect(loaded).toEqual(["a"])
    expect(state.isComplete()).toBe(true)
    expect(state.data()).toBe("value:a")

    dispose()
  })
})

test("http query reports idle while disabled and loads once it is enabled", async () => {
  await createRoot(async (dispose) => {
    const [enabled, enabledSet] = createSignal(false)
    const loaded: string[] = []
    const state = httpQueryStateCreate<string>({
      enabled,
      key: () => "a",
      load: async (current) => {
        loaded.push(current)
        return createResult(`value:${current}`)
      },
    })

    await tick()
    expect(loaded).toEqual([])
    expect(state.isIdle()).toBe(true)
    expect(state.isLoading()).toBe(false)

    enabledSet(true)
    expect(state.isIdle()).toBe(false)
    expect(state.isLoading()).toBe(true)
    await tick()
    expect(loaded).toEqual(["a"])
    expect(state.isComplete()).toBe(true)

    dispose()
  })
})

test("http query returns to idle when it is disabled again after a completed read", async () => {
  await createRoot(async (dispose) => {
    const [enabled, enabledSet] = createSignal(true)
    const state = httpQueryStateCreate<string>({
      enabled,
      key: () => "a",
      load: async (current) => createResult(`value:${current}`),
    })

    await tick()
    expect(state.isComplete()).toBe(true)

    enabledSet(false)
    expect(state.isIdle()).toBe(true)
    expect(state.isLoading()).toBe(false)
    expect(state.data()).toBeUndefined()

    dispose()
  })
})

test("http query clears data when the selection changes so a new key never shows stale rows", async () => {
  await createRoot(async (dispose) => {
    const [key, keySet] = createSignal<string | undefined>("a")
    const state = httpQueryStateCreate<string>({
      key,
      load: async (current) => createResult(`value:${current}`),
    })

    await tick()
    expect(state.data()).toBe("value:a")

    keySet("b")
    expect(state.data()).toBeUndefined()
    expect(state.isLoading()).toBe(true)
    await tick()
    expect(state.data()).toBe("value:b")

    dispose()
  })
})

test("http query refresh keeps existing data while revalidating the same key", async () => {
  await createRoot(async (dispose) => {
    let call = 0
    const state = httpQueryStateCreate<string>({
      key: () => "a",
      load: async () => {
        call += 1
        return createResult(`value:${call}`)
      },
    })

    await tick()
    expect(state.data()).toBe("value:1")

    state.refresh()
    expect(state.data()).toBe("value:1")
    expect(state.isLoading()).toBe(true)
    await tick()
    expect(state.data()).toBe("value:2")
    expect(state.isComplete()).toBe(true)

    dispose()
  })
})

test("http query surfaces errors and recovers through retry", async () => {
  await createRoot(async (dispose) => {
    let shouldFail = true
    const state = httpQueryStateCreate<string>({
      key: () => "a",
      load: async () => (shouldFail ? createResultError("load", "The request failed.") : createResult("value")),
    })

    await tick()
    expect(state.isError()).toBe(true)
    expect(state.errorMessage()).toBe("The request failed.")
    expect(state.data()).toBeUndefined()

    shouldFail = false
    state.retry()
    await tick()
    expect(state.isComplete()).toBe(true)
    expect(state.data()).toBe("value")
    expect(state.errorMessage()).toBeUndefined()

    dispose()
  })
})

test("http query ignores a superseded in-flight response for an older key", async () => {
  await createRoot(async (dispose) => {
    const [key, keySet] = createSignal<string | undefined>("a")
    const resolvers = new Map<string, (value: string) => void>()
    const state = httpQueryStateCreate<string>({
      key,
      load: (current) =>
        new Promise((resolve) => {
          resolvers.set(current, (value) => resolve(createResult(value)))
        }),
    })

    await tick()
    keySet("b")
    await tick()

    resolvers.get("a")?.("stale-a")
    resolvers.get("b")?.("fresh-b")
    await tick()

    expect(state.data()).toBe("fresh-b")

    dispose()
  })
})

test("http query uses an account cache for conditional requests and keeps data on 304", async () => {
  await createRoot(async (dispose) => {
    const cache = httpQueryCacheCreate("http-query-304")
    expect(httpQueryCacheCreate("http-query-304")).toBe(cache)
    expect(httpQueryCacheCreate("http-query-other").get<string>("/api/items?a=1&b=2")).toBeUndefined()

    const requests: Array<string | undefined> = []
    let call = 0
    const state = httpQueryStateCreate<string>({
      cache,
      key: () => "/api/items?a=1&b=2",
      load: async (_key, _signal, cached) => {
        requests.push(cached?.etag)
        call += 1
        if (call === 1) return createResult({ data: "cached-value", etag: '"items-1"', revision: 1, status: 200 })
        return createResult({ status: 304 })
      },
    })

    await tick()
    expect(state.data()).toBe("cached-value")
    expect(cache.get<string>("/api/items?b=2&a=1")?.revision).toBe(1)

    state.refresh()
    expect(state.data()).toBe("cached-value")
    await tick()
    expect(requests).toEqual([undefined, '"items-1"'])
    expect(state.data()).toBe("cached-value")
    expect(cache.get<string>("/api/items?a=1&b=2")?.etag).toBe('"items-1"')

    dispose()
  })
})

test("http query replaces cached data on 200 and ignores older invalidation revisions", async () => {
  await createRoot(async (dispose) => {
    const cache = httpQueryCacheCreate("http-query-revisions")
    let call = 0
    const state = httpQueryStateCreate<string>({
      cache,
      key: () => "resource:items",
      load: async () => {
        call += 1
        if (call === 1) return createResult({ data: "old-value", etag: '"items-2"', revision: 2, status: 200 })
        return createResult({
          data: call === 2 ? "new-value" : "old-response",
          etag: '"items-3"',
          revision: 3,
          status: 200,
        })
      },
    })

    await tick()
    expect(state.data()).toBe("old-value")
    state.refresh()
    await tick()
    expect(state.data()).toBe("new-value")
    expect(cache.get<string>("resource:items")?.etag).toBe('"items-3"')
    expect(cache.invalidate("resource:items", 1)).toBe(false)
    expect(cache.get<string>("resource:items")?.revision).toBe(3)
    expect(cache.invalidate("resource:items", 4)).toBe(true)
    expect(cache.invalidate("resource:items", 3)).toBe(false)

    state.refresh()
    await tick()
    expect(state.data()).toBe("new-value")
    expect(cache.get<string>("resource:items")?.revision).toBe(3)

    dispose()
  })
})
