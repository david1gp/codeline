import { expect, test } from "bun:test"
import { runDetailFetch } from "../src/run/ui/runDetailFetch.js"
import { runToolDetailFetch } from "../src/run/ui/runToolDetailFetch.js"

test("run detail client loads normalized detail only from its encoded route", async () => {
  const requests: string[] = []
  const result = await runDetailFetch("session/1", "run/1", {
    fetch: async (input) => {
      requests.push(String(input))
      return Response.json({
        run: { cancellationKind: null, failure: null, id: "run/1", sessionId: "session/1", status: "succeeded" },
        tools: [],
        transcript: {
          activities: [],
          assistantText: "Done",
          attempts: [],
          cancellation: null,
          failure: null,
          invariantViolations: [],
          terminalOutcome: { status: "completed" },
        },
      })
    },
  })

  expect(requests).toEqual(["/api/sessions/session%2F1/runs/run%2F1/detail"])
  expect(result.success).toBe(true)
})

test("tool detail client uses the semantic step run and detail identifiers", async () => {
  const requests: string[] = []
  const result = await runToolDetailFetch("session-1", "run/1", "tool/1", {
    fetch: async (input) => {
      requests.push(String(input))
      return Response.json({
        runId: "run/1",
        sessionId: "session-1",
        tool: { detailId: "tool/1", sequence: 2, toolCallId: "tool/1", toolName: "read" },
      })
    },
  })

  expect(requests).toEqual(["/api/sessions/session-1/runs/run%2F1/tools/tool%2F1/detail"])
  expect(result.success).toBe(true)
})

test("lazy detail UI has disclosure-triggered loading and accessible retry states", async () => {
  const row = await Bun.file(new URL("../src/ui/SessionSemanticStepRow.tsx", import.meta.url)).text()
  const history = await Bun.file(new URL("../src/ui/SessionSemanticHistory.tsx", import.meta.url)).text()

  expect(row).toContain("#ui/interactive/details/Details.jsx")
  expect(row).toContain("state.detailExpand")
  expect(row).toContain('role="alert"')
  expect(history).toContain("Waiting for input")
  expect(history).toContain("compactState()?.input")
  expect(history).toContain("retryOlderHistory")
})
