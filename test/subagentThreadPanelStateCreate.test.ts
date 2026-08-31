import { expect, test } from "bun:test"
import type { SelectedSessionView } from "../src/ui/selectedSessionView.js"
import type { SessionStreamGroup } from "../src/ui/sessionStreamGroupsDerive.js"
import { subagentThreadPanelStateCreate } from "../src/ui/subagentThreadPanelStateCreate.js"

test("subagent thread panel keeps the authoritative child session target", () => {
  const selected = {
    childSessionId: "child-session",
    childStreamId: "child-attempt-stream",
    delegationId: "delegation-1",
    parentSessionId: "parent-session",
    task: "Inspect the project.",
  }
  const groups: ReadonlyArray<SessionStreamGroup> = [groupCreate("child-attempt-stream")]
  const state = subagentThreadPanelStateCreate(
    () =>
      ({
        streamGroups: () => groups,
        subagentThread: { close: () => {}, open: () => {}, selected: () => selected },
      }) as unknown as SelectedSessionView,
  )

  expect(state.delegation()).toEqual(selected)
  expect(state.delegation()?.childSessionId).toBe("child-session")
  expect(state.group()?.streamId).toBe("child-attempt-stream")
})

function groupCreate(streamId: string): SessionStreamGroup {
  return { entries: [], id: streamId, label: "Stream", streamId }
}
