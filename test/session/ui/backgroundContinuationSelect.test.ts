import { describe, expect, test } from "bun:test"
import {
  backgroundContinuationMessageCreate,
  backgroundContinuationSelect,
} from "../../../src/session/ui/backgroundContinuationSelect.js"

const base = {
  background: true,
  childRunId: "child-1",
  continuationDelivered: false,
  delegationId: "delegation-1",
  task: "Research auth flows",
}

describe("backgroundContinuationSelect", () => {
  test("selects an undelivered finalized background result", () => {
    const pending = backgroundContinuationSelect([
      { ...base, background: false, finalizedResult: { status: "succeeded", text: "done" } },
      { ...base, finalizedResult: { status: "succeeded", text: "auth uses sessions" } },
    ])
    expect(pending?.delegationId).toBe("delegation-1")
    expect(pending?.message).toContain("auth uses sessions")
  })

  test("includes failed results so the parent learns about the failure", () => {
    const pending = backgroundContinuationSelect([
      { ...base, finalizedResult: { failure: { code: "x", message: "boom" }, status: "failed", text: "" } },
    ])
    expect(pending?.message).toContain("failed")
    expect(pending?.message).toContain("boom")
  })

  test("skips foreground, delivered, unfinished, and aborted delegations", () => {
    expect(
      backgroundContinuationSelect([
        { ...base, background: false, finalizedResult: { status: "succeeded", text: "x" } },
      ]),
    ).toBeUndefined()
    expect(
      backgroundContinuationSelect([
        { ...base, continuationDelivered: true, finalizedResult: { status: "succeeded", text: "x" } },
      ]),
    ).toBeUndefined()
    expect(backgroundContinuationSelect([{ ...base, finalizedResult: null }])).toBeUndefined()
    expect(
      backgroundContinuationSelect([
        {
          ...base,
          finalizedResult: {
            failure: { code: "child_aborted", message: "cancelled" },
            status: "aborted",
            text: "",
          },
        },
      ]),
    ).toBeUndefined()
  })

  test("truncates oversized results with a pointer to the subagent thread", () => {
    const message = backgroundContinuationMessageCreate({
      ...base,
      finalizedResult: { status: "succeeded", text: `x${"y".repeat(10_000)}` },
    })
    expect(message).toContain("truncated")
    expect(message).toContain("subagent thread")
    expect(message?.length ?? 0).toBeLessThan(6_000)
  })
})
