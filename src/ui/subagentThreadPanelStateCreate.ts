import type { SelectedSessionView } from "./selectedSessionView.js"

export function subagentThreadPanelStateCreate(state: () => SelectedSessionView) {
  const delegation = () => {
    return state().subagentThread.selected()
  }
  const group = () => {
    const selected = delegation()
    if (selected === undefined) return undefined
    return state()
      .streamGroups()
      .find((candidate) => candidate.streamId === selected.childStreamId)
  }

  return { close: () => state().subagentThread.close(), delegation, group }
}
