import { expect, test } from "bun:test"
import { appCreate } from "../src/app/appCreate.js"
import { appKnownRouteResolve } from "../src/app/appKnownRouteResolve.js"

const app = appCreate({ uiShellPath: "./index.html" })

test("known application, demo, and simulation paths resolve to the UI shell", async () => {
  const paths = [
    "/",
    "/files/",
    "/notes",
    "/notes/new/",
    "/login",
    "/notes/note-1",
    "/notes/note-1/?session=selected",
    "/sessions",
    "/sessions/recent/",
    "/sessions/watched?session=selected",
    "/sessions/projects",
    "/sessions/search?search=term",
    "/settings",
    "/demo",
    "/demo/screens/conversation/",
    "/demo/screens/written-files",
    "/demo/components",
    "/demo/screens/workspace-screen",
    "/demo/components/session-list/",
    "/simulate",
    "/simulate/streaming/",
    "/simulate/retry-success",
  ]

  for (const path of paths) {
    const response = await app.request(`http://codeline.test${path}`)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("text/html")
  }
})

test("known-route resolution rejects unknown paths and malformed parameter paths", () => {
  expect(appKnownRouteResolve("/unknown")).toBe(false)
  expect(appKnownRouteResolve("/demo/unknown")).toBe(false)
  expect(appKnownRouteResolve("/demo/screens/note-workspace-screen")).toBe(true)
  expect(appKnownRouteResolve("/demo/components/theme-switcher")).toBe(true)
  expect(appKnownRouteResolve("/demo/screens/unknown-specimen")).toBe(false)
  expect(appKnownRouteResolve("/demo/components/session-list/extra")).toBe(false)
  expect(appKnownRouteResolve("/simulate")).toBe(true)
  expect(appKnownRouteResolve("/simulate/")).toBe(true)
  expect(appKnownRouteResolve("/simulate/retry-success/")).toBe(true)
  expect(appKnownRouteResolve("/simulate/unknown")).toBe(false)
  expect(appKnownRouteResolve("/notes/")).toBe(true)
  expect(appKnownRouteResolve("/notes/one/two")).toBe(false)
  expect(appKnownRouteResolve("/sessions")).toBe(true)
  expect(appKnownRouteResolve("/sessions/search/")).toBe(true)
  expect(appKnownRouteResolve("/sessions/unknown")).toBe(false)
  expect(appKnownRouteResolve("/sessions/recent/extra")).toBe(false)
  expect(appKnownRouteResolve("/login")).toBe(true)
  expect(appKnownRouteResolve("/login/extra")).toBe(false)
  expect(appKnownRouteResolve("/api/health")).toBe(false)
})

test("unknown server paths remain JSON 404 responses", async () => {
  for (const path of ["/unknown", "/demo/unknown", "/simulate/unknown", "/api/unknown", "/assets/unknown.js"]) {
    const response = await app.request(`http://codeline.test${path}`)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(response.headers.get("Content-Type")).toContain("application/json")
    expect(body.error.code).toBe("not_found")
  }
})

test("health and readiness remain non-HTML responses", async () => {
  const healthResponse = await app.request("http://codeline.test/health")
  const readinessResponse = await app.request("http://codeline.test/ready")

  expect(healthResponse.headers.get("Content-Type")).toContain("application/json")
  expect(readinessResponse.status).toBe(503)
  expect(readinessResponse.headers.get("Content-Type")).toContain("application/json")
})
