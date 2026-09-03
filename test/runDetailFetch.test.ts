import { expect, test } from "bun:test"
import { runDetailFetch } from "../src/run/ui/runDetailFetch.js"
import { runToolDetailFetch } from "../src/run/ui/runToolDetailFetch.js"

test("run detail client loads normalized detail only from its encoded route", async () => {
  const requests: string[] = []
  const result = await runDetailFetch("session/1", "run/1", {
    fetch: async (input) => {
      requests.push(String(input))
      return Response.json({
        detail: {
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
        },
        kind: "finalized",
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
        detail: {
          runId: "run/1",
          sessionId: "session-1",
          tool: { detailId: "tool/1", sequence: 2, toolCallId: "tool/1", toolName: "read" },
        },
        kind: "finalized",
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

test("semantic step rows expose stable kind and message role attributes", async () => {
  const row = await Bun.file(new URL("../src/ui/SessionSemanticStepRow.tsx", import.meta.url)).text()

  expect(row).toContain("data-session-semantic-kind={props.step.kind}")
  expect(row).toContain('data-session-message-role={props.step.kind === "message" ? props.step.role : undefined}')
})

test("child conversation control stays outside the detail expansion wrapper", async () => {
  const row = await Bun.file(new URL("../src/ui/SessionSemanticStepRow.tsx", import.meta.url)).text()
  const detailIdentity = row.indexOf("data-session-history-entry-id")
  const detailsEnd = row.indexOf("</Details>", detailIdentity)
  const detailWrapperEnd = row.indexOf("</div>", detailsEnd)
  const childControl = row.indexOf('<Show when={props.step.kind === "tool" && props.step.childReference != null}>')

  expect(detailIdentity).toBeGreaterThanOrEqual(0)
  expect(detailsEnd).toBeGreaterThan(detailIdentity)
  expect(detailWrapperEnd).toBeGreaterThan(detailsEnd)
  expect(childControl).toBeGreaterThan(detailWrapperEnd)
  expect(row).toContain("data-child-run-id")
  expect(row).toContain("data-child-session-id")
  expect(row).toContain("Open child conversation")
})
