import type { Accessor } from "solid-js"
import type { applicationShellStateCreate } from "../../ui/applicationShellStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function sessionCreationResourceSidebarStateCreate(props: Accessor<{
  idPrefix?: string
  shell?: ReturnType<typeof applicationShellStateCreate>
  target: SessionTargetSelectorState
}>) {
  return {
    prefix: () => props().idPrefix ?? "session-creation-resources",
    width: () => props().shell?.sessionContextWidth() ?? 320,
    preset: {
      get: () => props().target.selectedPresetId() ?? "",
      set: (id: string) => props().target.presetSelect(id),
    },
    presetOptions: () => ["", ...props().target.presets().map(({ id }) => id)],
    presetOptionText: (id: string) => props().target.presets().find((preset) => preset.id === id)?.name ?? "Default agent",
    server: {
      get: () => props().target.selectedServerId() ?? "",
      set: (id: string) => props().target.alternativeServerSelect(id),
    },
    serverOptions: () => props().target.servers().map(({ id }) => id),
    serverOptionText: (id: string) => props().target.servers().find((server) => server.id === id)?.name ?? id,
    agent: {
      get: () => props().target.selectedAgentId() ?? "",
      set: (id: string) => props().target.alternativeAgentSelect(id),
    },
    agentOptions: () => props().target.agents().map(({ id }) => id),
    agentOptionText: (id: string) => props().target.agents().find((agent) => agent.id === id)?.name ?? id,
  }
}
