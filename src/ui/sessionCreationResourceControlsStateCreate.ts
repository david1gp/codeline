import type { SelectSingleEntry } from "#ui/input/select/SelectSingleEntry.js"
import type { SignalObject } from "#ui/utils/createSignalObject.js"
import { sessionProjectSelectorOptionsDerive } from "./sessionProjectSelectorOptionsDerive.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

export type SessionCreationResourceControl = {
  /** Option values in list order, so the view only renders them. */
  options: () => string[]
  /** Human label of an option value, so encoded tool ids never reach the view. */
  optionText: (value: string) => string
  valueSignal: SignalObject<string[]>
}

export type SessionCreationResourceControls = {
  isAllPreset: () => boolean
  preset: SignalObject<string>
  presetOptions: () => string[]
  presetOptionText: (presetName: string) => string
  project: SignalObject<string>
  projectOptions: () => SelectSingleEntry[]
  projectOptionText: (projectId: string) => string
  skillGroups: SessionCreationResourceControl
  skills: SessionCreationResourceControl
  tools: SessionCreationResourceControl
}

const toolValueSeparator = "::"
const sessionCreationResourceTools = ["bash", "webfetch", "read", "write", "edit"] as const

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
  const isAllPreset = () => resources().presetName() === "all"

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
    const activeNames = new Set(
      resources()
        .activeSkills()
        .map(({ name }) => name),
    )
    for (const bundle of resources().skillBundles()) {
      if (seen.has(bundle.name)) continue
      seen.set(bundle.name, {
        isActive: activeNames.has(bundle.name),
        name: bundle.name,
      })
    }
    for (const folder of resources().folders()) {
      for (const skill of folder.skills) {
        if (seen.has(skill.name)) continue
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
        sessionCreationResourceTools
          .filter(
            (tool) =>
              tool === "bash" ||
              tool === "webfetch" ||
              agent.read !== undefined ||
              agent.write !== undefined ||
              agent.edit !== undefined,
          )
          .map((tool) => ({
            agentId: agent.agentId,
            isEnabled: agent[tool] ?? false,
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

  const projectOptions = () => sessionProjectSelectorOptionsDerive(resources().projects())

  const projectOptionText = (projectId: string) => {
    if (projectId === "") return "Select a project…"
    return (
      resources()
        .projects()
        .find((project) => project.id === projectId)?.label ?? projectId
    )
  }

  const presetOptions = () =>
    resources()
      .presets()
      .map((preset) => preset.name)

  const presetOptionText = (name: string) => {
    const preset = resources()
      .presets()
      .find((candidate) => candidate.name === name)
    return preset?.displayName ?? preset?.description ?? name
  }

  return {
    isAllPreset,
    preset: {
      get: () => resources().presetName() ?? "",
      set: (name: string) => resources().presetSelect(name),
    },
    presetOptions,
    presetOptionText,
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
        set: (next: string[]) => {
          if (isAllPreset()) return
          sessionCreationResourceControlToggle(groupOptions(), groupSelected(), next, resources().folderToggle)
        },
      },
    },
    skills: {
      options: skillOptions,
      optionText: (value: string) => value,
      valueSignal: {
        get: () => [...skillSelected()],
        set: (next: string[]) => {
          if (isAllPreset()) return
          sessionCreationResourceControlToggle(skillOptions(), skillSelected(), next, resources().skillToggle)
        },
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
