import type { SelectedSessionView } from "./selectedSessionView.js"

export function subagentThreadPanelStateCreate(state: () => SelectedSessionView) {
  const delegation = () => {
    const selected = state().subagentThread.selected()
    if (selected === undefined) return undefined
    for (const group of state().streamGroups()) {
      const current = group.entries.find((entry) => entry.delegation?.id === selected.id)?.delegation
      if (current !== undefined) return current
    }
    return selected
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
