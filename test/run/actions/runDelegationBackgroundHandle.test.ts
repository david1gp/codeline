import { describe, expect, test } from "bun:test"
import {
  runDelegationBackgroundHandleCreate,
  runDelegationBackgroundResultRender,
} from "../../../src/run/actions/runDelegationBackgroundHandleCreate.js"

describe("runDelegationBackgroundHandleCreate", () => {
  test("returns an immediately-usable running handle", () => {
    const handle = runDelegationBackgroundHandleCreate({ description: "Research auth", sessionId: "tool-1" })
    expect(handle).toContain('<task id="tool-1" state="running">')
    expect(handle).toContain("background")
  })

  test("renders completed results in the shared task envelope", () => {
    const rendered = runDelegationBackgroundResultRender({
      sessionId: "tool-1",
      state: "completed",
      text: "done",
    })
    expect(rendered).toContain("<task_result>")
    expect(rendered).toContain("done")
  })
})
