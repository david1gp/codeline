import { expect, mock, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { connectionStatusKind } from "../src/ui/connectionStatusKind.js"
import { connectionStatusSource } from "../src/ui/connectionStatusSource.js"
import { eventFeedConnectionIndicatorStateCreate } from "../src/ui/eventFeedConnectionIndicatorStateCreate.js"
import type { PwaStatusView } from "../src/ui/pwa/pwaStatusView.js"
import type { UiDataLayerStatus } from "../src/ui/uiDataLayerStatusSchema.js"

const { appConnectionDetailsResolve } = await import("../src/ui/appConnectionDetailsResolve.js")

const pwaHealthy: PwaStatusView = {
  disconnectedSince: () => undefined,
  install: () => Promise.resolve(),
  installable: () => false,
  label: () => "App online",
  reloadForUpdate: () => undefined,
  status: () => "online",
}

test("the event feed indicator starts offline and labels every feed status", () => {
  const root = createRoot((dispose) => {
    const events = eventFeedConnectionIndicatorStateCreate()

    expect(events.status()).toBe("offline")
    expect(events.label()).toBe("Events offline")
    expect(events.disconnectedSince()).toBeNumber()

    const labels: readonly [UiDataLayerStatus, UiDataLayerStatus["status"], string][] = [
      [{ asOfCursor: null, lastEventId: null, status: "connected" }, "connected", "Events connected"],
      [{ asOfCursor: "cursor-1", lastEventId: "cursor-1", status: "connected" }, "connected", "Events connected"],
      [{ attempt: 2, lastEventId: null, status: "reconnecting" }, "reconnecting", "Events reconnecting"],
      [{ reason: "bootstrap", status: "reconciling" }, "reconciling", "Events reconciling"],
      [
        { cachedRevision: 1, resourceId: "session-1", resourceType: "session", status: "stale" },
        "stale",
        "Events stale",
      ],
      [{ accountId: null, status: "offline" }, "offline", "Events offline"],
    ]
    for (const [status, expectedStatus, expectedLabel] of labels) {
      events.statusSet(status)
      expect(events.status()).toBe(expectedStatus)
      expect(events.label()).toBe(expectedLabel)
    }

    return { dispose, events }
  })

  expect(root.events).toBeDefined()
  root.dispose()
})

test("leaving offline clears the disconnected timestamp and re-entering it stamps a new one", () => {
  const root = createRoot((dispose) => {
    const events = eventFeedConnectionIndicatorStateCreate()
    return { dispose, events }
  })

  const { events } = root
  events?.statusSet({ asOfCursor: null, lastEventId: null, status: "connected" })
  expect(events?.disconnectedSince()).toBeUndefined()

  const beforeOffline = Date.now() - 1
  events?.statusSet({ accountId: null, status: "offline" })
  expect(events?.disconnectedSince()).toBeGreaterThanOrEqual(beforeOffline)

  events?.statusSet({ attempt: 1, lastEventId: null, status: "reconnecting" })
  expect(events?.disconnectedSince()).toBeUndefined()
  root.dispose()
})

test("app connection details map feed statuses to indicator kinds in shell order", () => {
  const health = {
    disconnectedSince: () => undefined,
    label: () => "API connected",
    status: () => "connected",
  }
  const mappings: readonly [
    UiDataLayerStatus["status"],
    (typeof connectionStatusKind)[keyof typeof connectionStatusKind],
  ][] = [
    ["connected", connectionStatusKind.ok],
    ["reconnecting", connectionStatusKind.connecting],
    ["reconciling", connectionStatusKind.checking],
    ["offline", connectionStatusKind.offline],
    ["stale", connectionStatusKind.error],
  ]

  for (const [feedStatus, expectedKind] of mappings) {
    const lines = appConnectionDetailsResolve({
      events: {
        disconnectedSince: () => undefined,
        label: () => `Events ${feedStatus}`,
        status: () => feedStatus,
      },
      healthDisconnectedSince: health.disconnectedSince,
      healthLabel: health.label,
      healthStatus: health.status,
      pwa: pwaHealthy,
    })

    expect(lines.map((line) => line.source)).toEqual([
      connectionStatusSource.app,
      connectionStatusSource.events,
      connectionStatusSource.api,
    ])
    expect(lines[1]?.kind).toBe(expectedKind)
    expect(lines[1]?.label).toBe(`Events ${feedStatus}`)
  }
})
