import { describe, expect, test } from "bun:test"
import { deferredAbortControllerCreate } from "../../../src/providers/runtime/deferredAbortControllerCreate.js"

describe("deferredAbortControllerCreate", () => {
  test("forwards an upstream abort immediately when no tool is in flight", () => {
    const upstream = new AbortController()
    const deferred = deferredAbortControllerCreate({ signal: upstream.signal })
    expect(deferred.signal.aborted).toBe(false)
    upstream.abort()
    expect(deferred.signal.aborted).toBe(true)
    expect(deferred.policyAborted()).toBe(false)
  })

  test("forwards an upstream abort immediately even mid-tool", () => {
    const upstream = new AbortController()
    const deferred = deferredAbortControllerCreate({ signal: upstream.signal })
    deferred.toolStart()
    upstream.abort()
    // Immediate stops and shutdown kill in-flight work; only graceful stops wait.
    expect(deferred.signal.aborted).toBe(true)
    expect(deferred.policyAborted()).toBe(false)
    deferred.toolEnd()
    expect(deferred.signal.aborted).toBe(true)
  })

  test("aborts at the boundary for a graceful request without an upstream abort", () => {
    const upstream = new AbortController()
    let requested = false
    const deferred = deferredAbortControllerCreate({
      isCancelRequested: () => requested,
      signal: upstream.signal,
    })
    deferred.toolStart()
    requested = true
    deferred.boundaryCheck()
    // A tool is still in flight: still no abort.
    expect(deferred.signal.aborted).toBe(false)
    deferred.toolEnd()
    expect(deferred.signal.aborted).toBe(true)
    expect(deferred.policyAborted()).toBe(true)
  })

  test("aborts promptly on a boundary check when no tool is in flight", () => {
    const upstream = new AbortController()
    const deferred = deferredAbortControllerCreate({
      isCancelRequested: () => true,
      signal: upstream.signal,
    })
    expect(deferred.signal.aborted).toBe(false)
    deferred.boundaryCheck()
    expect(deferred.signal.aborted).toBe(true)
    expect(deferred.policyAborted()).toBe(true)
  })

  test("supports nested tool calls with a counter", () => {
    const upstream = new AbortController()
    let requested = false
    const deferred = deferredAbortControllerCreate({
      isCancelRequested: () => requested,
      signal: upstream.signal,
    })
    deferred.toolStart()
    deferred.toolStart()
    requested = true
    deferred.toolEnd()
    expect(deferred.signal.aborted).toBe(false)
    deferred.toolEnd()
    expect(deferred.signal.aborted).toBe(true)
    expect(deferred.policyAborted()).toBe(true)
  })
})
