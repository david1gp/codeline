import type { AgentInstructionInspectionResponse } from "../instructions/api/agentInstructionInspectionResponseSchema.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { SessionExecutionResourceSummary } from "../session/api/sessionExecutionResourceSummarySchema.js"
import type { SessionExecutionSelection } from "../session/schema/sessionExecutionSelectionSchema.js"
import type { SkillCatalogInspectionResponse } from "../skills/api/skillCatalogInspectionResponseSchema.js"
import type { SkillPresetInspectionResponse } from "../skills/api/skillPresetInspectionResponseSchema.js"
import type { SkillPreset } from "../skills/schema/skillPresetSchema.js"
import type { SessionResourceSkillTreeFolderNode } from "./sessionResourceSkillTreeDerive.js"

export type SessionResourceSelectorAgentTools = {
  agentId: string
  bash: boolean
  read?: boolean
  write?: boolean
  edit?: boolean
  isPrimary: boolean
  name: string
  role: string
  webfetch: boolean
}

export type SessionResourceSelectorActiveSkill = {
  bundlePath: string
  description: string
  name: string
  source: "global" | "project"
}

export type SessionResourceSelectorInstructionSnapshot =
  | AgentInstructionInspectionResponse["snapshots"][number]
  | SessionExecutionResourceSummary["instructionSources"][number]

export type SessionResourceSelectorProject = {
  available?: boolean
  id: string
  label: string
  parentFolder?: { id: string; label: string } | null
}

/**
 * Rendering contract of the pre-session resource workspace, so production
 * composition and demo fixtures supply the same panels without the view knowing
 * whether the selection is still mutable or already captured by a session.
 */
export type SessionResourceSelectorView = {
  activeSkills: () => readonly SessionResourceSelectorActiveSkill[]
  agentPrompt: () => string | undefined
  agentPromptCharacterCount: () => number
  agentPromptChange: (value: string) => void
  agentPromptEstimatedTokens: () => number
  agentTools: () => readonly SessionResourceSelectorAgentTools[]
  collisions: () => SkillCatalogInspectionResponse["collisions"]
  descriptionCatalog: () => { characterCount: number; content: string; estimatedTokens: number }
  diagnostics: () => SkillCatalogInspectionResponse["diagnostics"]
  errorMessage: () => string | null
  /** Immutable selection captured by an already created session, if one is open. */
  existingExecutionSelection: () => SessionExecutionSelection | null
  /**
   * Sanitized immutable execution resources captured by an already created session.
   * Null while no session is open, or when the session predates manifest capture.
   */
  existingExecutionResources: () => SessionExecutionResourceSummary | null
  folders: () => readonly SessionResourceSkillTreeFolderNode[]
  folderToggle: (folderPath: string, enabled: boolean) => void
  groups: () => SkillCatalogInspectionResponse["groups"]
  instructionDiagnostics: () => AgentInstructionInspectionResponse["diagnostics"]
  instructionCharacterCount: () => number
  instructionContent: (canonicalPath: string) => string | undefined
  instructionContentChange: (canonicalPath: string, value: string) => void
  instructionEstimatedTokens: () => number
  instructionOverrides: () => Readonly<Record<string, string>>
  instructionSnapshots: () => readonly SessionResourceSelectorInstructionSnapshot[]
  inspectorOpen: () => boolean
  inspectorOpenChange: (open: boolean) => void
  /** False once a session exists, because its captured selection cannot be changed. */
  isMutable: () => boolean
  missingFolderPaths: () => readonly string[]
  missingSkillNames: () => readonly string[]
  pendingExecutionSelection: () => SessionExecutionSelection | undefined
  pendingSkillSelection: () =>
    | { override: { disabledSkills: string[]; enabledSkills: string[] }; presetName: string }
    | undefined
  presetDiagnostics: () => SkillPresetInspectionResponse["diagnostics"]
  presetName: () => string | null
  presetSelect: (name: string) => void
  presets: () => readonly SkillPreset[]
  presetSource: () => "default" | "override"
  projects: () => readonly SessionResourceSelectorProject[]
  projectRegistryStatus: () => ReturnType<ProjectRegistryState["status"]>
  projectSelect: (projectId: string) => void
  retry: () => void
  roots: () => SkillCatalogInspectionResponse["roots"]
  selectedProjectId: () => string | null
  skillBundles: () => SkillCatalogInspectionResponse["bundles"]
  skillToggle: (name: string, enabled: boolean) => void
  status: () => "error" | "idle" | "loading" | "offline" | "ready"
  toolToggle: (agentId: string, tool: "bash" | "webfetch" | "read" | "write" | "edit", enabled: boolean) => void
}
