import { expect, test } from "bun:test"
import type { ConnectionState } from "@rocicorp/zero"
import { type ZeroConnectionStatus, zeroConnectionStatusResolve } from "../src/ui/zeroConnectionStatusResolve.js"

test.each([
  [{ name: "connecting" }, "connecting"],
  [{ name: "connected" }, "online"],
  [{ name: "disconnected", reason: "network unavailable" }, "offline"],
  [{ name: "closed", reason: "client closed" }, "offline"],
  [{ name: "error", reason: "fatal" }, "error"],
  [{ name: "needs-auth", reason: { type: "zero-cache", reason: "unauthorized" } }, "error"],
] satisfies readonly [ConnectionState, ZeroConnectionStatus][])('maps Zero state "$name" to %s', (state, expected) => {
  expect(zeroConnectionStatusResolve(state)).toBe(expected)
})
