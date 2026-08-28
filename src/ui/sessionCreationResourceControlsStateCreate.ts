import type { SignalObject } from "#ui/utils/createSignalObject.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

export type SessionCreationResourceControl = {
  /** Option values in list order, so the view only renders them. */
  options: () => string[]
  /** Human label of an option value, so encoded tool ids never reach the view. */
  optionText: (value: string) => string
  valueSignal: SignalObject<string[]>
}

export type SessionCreationResourceControls = {
  preset: SignalObject<string>
  project: SignalObject<string>
  projectOptions: () => string[]
  projectOptionText: (projectId: string) => string
  skillGroups: SessionCreationResourceControl
  skills: SessionCreationResourceControl
  tools: SessionCreationResourceControl
}

const toolValueSeparator = "::"

function sessionCreationResourceControlToggle(
  options: readonly string[],
  selected: readonly string[],
  next: readonly string[],
  toggle: (value: string, enabled: boolean) => void,
): void {
  const selectedSet = new Set(selected)
  const nextSet = new Set(next)
  for (const option of options) {
    const enabled = nextSet.has(option)
    if (enabled === selectedSet.has(option)) continue
    toggle(option, enabled)
  }
}

/**
 * Adapts the pre-session resource selection to the generic multi-select contract,
 * so the compact creation sidebar toggles skill groups, skills, and agent tools
 * through the existing session-scoped setters instead of owning its own state.
 */
export function sessionCreationResourceControlsStateCreate(
  resources: () => SessionResourceSelectorView,
): SessionCreationResourceControls {
  const groupNodes = () =>
    resources()
      .folders()
      .filter((folder) => folder.descendantSkillNames.length > 0)
  const groupOptions = () => groupNodes().map((folder) => folder.path)
  const groupSelected = () =>
    groupNodes()
      .filter((folder) => folder.selection === "all")
      .map((folder) => folder.path)

  const skillNodes = () => {
    const seen = new Map<string, { isActive: boolean; name: string }>()
    for (const folder of resources().folders()) {
      for (const skill of folder.skills) {
        if (skill.isExcluded || seen.has(skill.name)) continue
        seen.set(skill.name, { isActive: skill.isActive, name: skill.name })
      }
    }
    return [...seen.values()].sort((left, right) => left.name.localeCompare(right.name))
  }
  const skillOptions = () => skillNodes().map((skill) => skill.name)
  const skillSelected = () =>
    skillNodes()
      .filter((skill) => skill.isActive)
      .map((skill) => skill.name)

  const toolNodes = () =>
    resources()
      .agentTools()
      .flatMap((agent) =>
        (["bash", "webfetch"] as const).map((tool) => ({
          agentId: agent.agentId,
          isEnabled: tool === "bash" ? agent.bash : agent.webfetch,
          label: `${agent.name} · ${tool}`,
          tool,
          value: `${agent.agentId}${toolValueSeparator}${tool}`,
        })),
      )
  const toolOptions = () => toolNodes().map((entry) => entry.value)
  const toolSelected = () =>
    toolNodes()
      .filter((entry) => entry.isEnabled)
      .map((entry) => entry.value)

  const projectOptions = () =>
    resources().selectedProjectId() === null
      ? [
          "",
          ...resources()
            .projects()
            .map((project) => project.id),
        ]
      : resources()
          .projects()
          .map((project) => project.id)

  const projectOptionText = (projectId: string) => {
    if (projectId === "") return "Select a project…"
    return (
      resources()
        .projects()
        .find((project) => project.id === projectId)?.label ?? projectId
    )
  }

  return {
    preset: {
      get: () => resources().presetName() ?? "",
      set: (name: string) => resources().presetSelect(name),
    },
    project: {
      get: () => resources().selectedProjectId() ?? "",
      set: (projectId: string) => resources().projectSelect(projectId),
    },
    projectOptions,
    projectOptionText,
    skillGroups: {
      options: groupOptions,
      optionText: (value: string) => {
        const folder = groupNodes().find((candidate) => candidate.path === value)
        if (folder === undefined) return value
        return `${folder.label} (${folder.descendantSkillNames.length})`
      },
      valueSignal: {
        get: () => [...groupSelected()],
        set: (next: string[]) =>
          sessionCreationResourceControlToggle(groupOptions(), groupSelected(), next, resources().folderToggle),
      },
    },
    skills: {
      options: skillOptions,
      optionText: (value: string) => value,
      valueSignal: {
        get: () => [...skillSelected()],
        set: (next: string[]) =>
          sessionCreationResourceControlToggle(skillOptions(), skillSelected(), next, resources().skillToggle),
      },
    },
    tools: {
      options: toolOptions,
      optionText: (value: string) => toolNodes().find((entry) => entry.value === value)?.label ?? value,
      valueSignal: {
        get: () => [...toolSelected()],
        set: (next: string[]) =>
          sessionCreationResourceControlToggle(toolOptions(), toolSelected(), next, (value, enabled) => {
            const entry = toolNodes().find((candidate) => candidate.value === value)
            if (entry === undefined) return
            resources().toolToggle(entry.agentId, entry.tool, enabled)
          }),
      },
    },
  }
}
