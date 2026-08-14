import { expect, test } from "bun:test"
import { appCreate } from "../src/app/appCreate.js"
import { appKnownRouteResolve } from "../src/app/appKnownRouteResolve.js"

const app = appCreate({ uiShellPath: "./index.html" })

test("known application and registered demo paths resolve to the UI shell", async () => {
  const paths = [
    "/",
    "/files/",
    "/notes",
    "/notes/new/",
    "/notes/note-1",
    "/notes/note-1/?session=selected",
    "/demo",
    "/demo/conversation/",
    "/demo/written-files",
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
  expect(appKnownRouteResolve("/notes/")).toBe(true)
  expect(appKnownRouteResolve("/notes/one/two")).toBe(false)
  expect(appKnownRouteResolve("/api/health")).toBe(false)
})

test("unknown server paths remain JSON 404 responses", async () => {
  for (const path of ["/unknown", "/demo/unknown", "/api/unknown", "/assets/unknown.js"]) {
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
