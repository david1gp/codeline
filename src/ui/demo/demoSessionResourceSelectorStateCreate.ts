import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { skillPresetAll } from "../../skills/skillPresetAll.js"
import type { SessionResourceSelectorView } from "../sessionResourceSelectorView.js"
import { sessionResourceSkillCatalogEstimate } from "../sessionResourceSkillCatalogEstimate.js"
import { sessionResourceSkillTreeDerive } from "../sessionResourceSkillTreeDerive.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoSkills = [
  {
    bundlePath: ".agents/skills/code",
    description: "Refactor and review TypeScript with the repository conventions.",
    name: "code-style",
    source: "project" as const,
  },
  {
    bundlePath: ".agents/skills/code",
    description: "Split changes into conventional commits and push them.",
    name: "commits",
    source: "project" as const,
  },
  {
    bundlePath: "global/skills/browser",
    description: "Drive a real browser for end-to-end verification.",
    name: "agent-browser",
    source: "global" as const,
  },
]

const demoGroups = [
  { path: ".agents/skills/code", precedence: 1, source: "project" as const },
  { path: "global/skills/browser", precedence: 0, source: "global" as const },
]

const demoProjects = [
  { id: "demo-project-codeline", label: "codeline" },
  { id: "demo-project-docs", label: "docs" },
]

export function demoSessionResourceSelectorStateCreate(
  variant: () => DemoSessionScreenVariant,
): SessionResourceSelectorView {
  const activeSkillNames = createSignalObject<readonly string[]>(["code-style", "commits"])
  const selectedPresetName = createSignalObject<string>("all")
  const selectedProjectId = createSignalObject<string | null>("demo-project-codeline")
  const inspectorOpen = createSignalObject(false)
  const tools = createSignalObject<
    Readonly<Record<string, { bash: boolean; webfetch: boolean; read: boolean; write: boolean; edit: boolean }>>
  >({
    "demo-primary": { bash: true, webfetch: false, read: true, write: true, edit: true },
    "demo-subagent": { bash: false, webfetch: true, read: true, write: false, edit: false },
  })

  const activeSkills = () => demoSkills.filter(({ name }) => activeSkillNames.get().includes(name))
  const namesSet = (names: readonly string[]) => activeSkillNames.set([...new Set(names)])

  return {
    activeSkills,
    agentTools: () => [
      {
        agentId: "demo-primary",
        isPrimary: true,
        name: "Local agent",
        role: "primary",
        ...tools.get()["demo-primary"]!,
      },
      {
        agentId: "demo-subagent",
        isPrimary: false,
        name: "Explore",
        role: "subagent",
        ...tools.get()["demo-subagent"]!,
      },
    ],
    agentPrompt: () => "You are a helpful coding assistant.",
    agentPromptCharacterCount: () => "You are a helpful coding assistant.".length,
    agentPromptChange: () => undefined,
    agentPromptEstimatedTokens: () => Math.ceil("You are a helpful coding assistant.".length / 4),
    collisions: () => [],
    descriptionCatalog: () => sessionResourceSkillCatalogEstimate(activeSkills()),
    diagnostics: () => [],
    errorMessage: () => (variant() === "error" ? "The session resources could not be loaded." : null),
    existingExecutionResources: () => null,
    existingExecutionSelection: () => null,
    folders: () =>
      sessionResourceSkillTreeDerive({
        activeSkillNames: activeSkillNames.get(),
        excludedSkillNames: [],
        groups: demoGroups,
        skills: demoSkills,
      }),
    folderToggle: (folderPath, enabled) => {
      const descendants = demoSkills
        .filter(({ bundlePath }) => bundlePath === folderPath || bundlePath.startsWith(`${folderPath}/`))
        .map(({ name }) => name)
      namesSet(
        enabled
          ? [...activeSkillNames.get(), ...descendants]
          : activeSkillNames.get().filter((name) => !descendants.includes(name)),
      )
    },
    groups: () => demoGroups,
    instructionDiagnostics: () => [],
    instructionCharacterCount: () => 0,
    instructionContent: () => undefined,
    instructionContentChange: () => undefined,
    instructionEstimatedTokens: () => 0,
    instructionOverrides: () => ({}),
    instructionSnapshots: () => [],
    inspectorOpen: inspectorOpen.get,
    inspectorOpenChange: inspectorOpen.set,
    isMutable: () => true,
    missingFolderPaths: () => [],
    missingSkillNames: () => [],
    pendingExecutionSelection: () => undefined,
    pendingSkillSelection: () => undefined,
    presetDiagnostics: () => [],
    presetName: selectedPresetName.get,
    presetSelect: (name) => selectedPresetName.set(name),
    presets: () => [
      skillPresetAll,
      { excludeSkills: [], includeFolders: [], includeSkills: [], name: "custom", version: 1 },
    ],
    presetSource: () => (selectedPresetName.get() === "all" ? "default" : "override"),
    projects: () => demoProjects,
    projectSelect: (projectId: string) => selectedProjectId.set(projectId === "" ? null : projectId),
    retry: () => undefined,
    roots: () => [],
    selectedProjectId: selectedProjectId.get,
    skillBundles: () => [],
    skillToggle: (name, enabled) =>
      namesSet(
        enabled ? [...activeSkillNames.get(), name] : activeSkillNames.get().filter((current) => current !== name),
      ),
    status: () => (variant() === "error" ? "error" : "ready"),
    toolToggle: (agentId, tool, enabled) =>
      tools.set({ ...tools.get(), [agentId]: { ...tools.get()[agentId]!, [tool]: enabled } }),
  }
}
