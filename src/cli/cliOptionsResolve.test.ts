import { describe, expect, test } from "bun:test"
import { cliOptionsResolve } from "./cliOptionsResolve.js"

describe("cliOptionsResolve", () => {
  test("defaults to local and lets CLI flags override config", () => {
    expect(cliOptionsResolve({}, {})).toEqual({ success: true, data: { backend: "local" } })
    expect(
      cliOptionsResolve(
        { backend: "https://configured.example", session: "config-session", theme: "dark" },
        { backend: "local", session: "cli-session" },
      ),
    ).toEqual({
      success: true,
      data: { backend: "local", session: "cli-session", theme: "dark" },
    })
  })

  test("selects a server URL and rejects invalid URLs", () => {
    expect(cliOptionsResolve({}, { backend: "https://server.example" })).toEqual({
      success: true,
      data: { backend: { serverUrl: "https://server.example" } },
    })
    expect(cliOptionsResolve({}, { backend: "not-a-url" }).success).toBe(false)
  })
})
