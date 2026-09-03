import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
const { sessionSemanticStepRowStateCreate } = await import("../src/ui/sessionSemanticStepRowStateCreate.js")

const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

test("semantic tool detail waits for expansion and can be retried", async () => {
  const requests: string[] = []
  let fail = true
  const state = createRoot(() =>
    sessionSemanticStepRowStateCreate({
      fetch: async (input: RequestInfo | URL) => {
        requests.push(String(input))
        if (fail) return Response.json({ error: { message: "Unavailable" } }, { status: 503 })
        return Response.json({
          detail: {
            runId: "run-1",
            sessionId: "session-1",
            tool: { detailId: "tool-1", sequence: 2, toolCallId: "tool-1", toolName: "read" },
          },
          kind: "finalized",
        })
      },
      sessionId: () => "session-1",
      step: () => ({
        detailId: "tool-1",
        id: "tool-1",
        kind: "tool" as const,
        runId: "run-1",
        sequence: 2,
        summary: "read · success",
      }),
    }),
  )

  await settle()
  expect(requests).toEqual([])

  state.detailExpand()
  await settle()
  expect(requests).toHaveLength(1)
  expect(state.isDetailError()).toBe(true)

  fail = false
  state.detailRetry()
  await settle()
  expect(requests).toHaveLength(2)
  expect(state.detail()).toMatchObject({
    detail: { runId: "run-1", tool: { detailId: "tool-1" } },
    kind: "finalized",
  })
})

test("child conversation action stops bubbling and preserves its identity", () => {
  let stopped = false
  let received: unknown
  const state = createRoot(() =>
    sessionSemanticStepRowStateCreate({
      onChildConversation: (link) => {
        received = link
      },
      sessionId: () => "parent-session-1",
      step: () => ({
        childReference: {
          childRunId: "child-run-1",
          childSessionId: null,
          delegationId: "delegation-1",
          parentSessionId: "parent-session-1",
        },
        detailId: "tool-1",
        id: "tool-1",
        kind: "tool" as const,
        runId: "run-1",
        sequence: 2,
        summary: "delegate_task · success",
      }),
    }),
  )

  state.childConversationOpen({
    stopPropagation: () => {
      stopped = true
    },
  } as Event)

  expect(stopped).toBe(true)
  expect(received).toEqual({
    childRunId: "child-run-1",
    delegationId: "delegation-1",
    parentSessionId: "parent-session-1",
    task: "delegate_task · success",
  })
})
