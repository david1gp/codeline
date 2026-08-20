import { expect, test } from "bun:test"
import { createSignal } from "solid-js/dist/solid.js"
import type { SelectedSessionView } from "../src/ui/selectedSessionView.js"
import type { SessionStreamDelegationLink, SessionStreamGroup } from "../src/ui/sessionStreamGroupsDerive.js"
import { subagentThreadPanelStateCreate } from "../src/ui/subagentThreadPanelStateCreate.js"

test("subagent thread panel follows the selected in-flight child into its latest retry stream", () => {
  const selected: SessionStreamDelegationLink = {
    childRunId: "child-run",
    childStreamId: "child-attempt-1-stream",
    delegationKey: "delegate-call",
    id: "delegation-1",
    parentAttemptId: "parent-attempt",
    parentRunId: "parent-run",
    task: "Inspect the project.",
  }
  const current: SessionStreamDelegationLink = { ...selected, childStreamId: "child-attempt-2-stream" }
  const [groups, groupsSet] = createSignal<ReadonlyArray<SessionStreamGroup>>([
    groupCreate("in-flight", [{ delegation: selected, id: "delegate-start", kind: "tool", label: "delegate_task" }]),
    groupCreate("child-attempt-1-stream", []),
  ])
  const state = subagentThreadPanelStateCreate(
    () =>
      ({
        streamGroups: groups,
        subagentThread: { close: () => {}, open: () => {}, selected: () => selected },
      }) as unknown as SelectedSessionView,
  )

  expect(state.group()?.streamId).toBe("child-attempt-1-stream")

  groupsSet([
    groupCreate("in-flight", [{ delegation: current, id: "delegate-start", kind: "tool", label: "delegate_task" }]),
    groupCreate("child-attempt-1-stream", []),
    groupCreate("child-attempt-2-stream", []),
  ])

  expect(state.delegation()).toEqual(current)
  expect(state.group()?.streamId).toBe("child-attempt-2-stream")
})

function groupCreate(streamId: string, entries: SessionStreamGroup["entries"]): SessionStreamGroup {
  return { entries, id: streamId, label: "Stream", streamId }
}
