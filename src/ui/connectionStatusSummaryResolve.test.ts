import { expect, test } from "bun:test"
import { connectionStatusKind } from "./connectionStatusKind.js"
import { connectionStatusSource } from "./connectionStatusSource.js"
import { connectionStatusSummaryResolve } from "./connectionStatusSummaryResolve.js"

test("connectionStatusSummaryResolve prefers error over other states", () => {
  const summary = connectionStatusSummaryResolve([
    {
      disconnectedSince: undefined,
      icon: "app",
      kind: connectionStatusKind.ok,
      label: "App online",
      source: connectionStatusSource.app,
    },
    {
      disconnectedSince: 1,
      icon: "zero",
      kind: connectionStatusKind.error,
      label: "Zero error",
      source: connectionStatusSource.zero,
    },
    {
      disconnectedSince: undefined,
      icon: "api",
      kind: connectionStatusKind.ok,
      label: "API connected",
      source: connectionStatusSource.api,
    },
  ])

  expect(summary).toEqual({ kind: connectionStatusKind.error, source: connectionStatusSource.zero })
})
