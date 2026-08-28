import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

export type SessionCapturedContextInstruction = {
  /** Absolute file path when the session captured one, so debugging can locate it. */
  canonicalPath: string | undefined
  /** Captured content when available; older session summaries may omit it. */
  content?: string
  estimatedTokens: number
  /** Project-relative path used as the human label. */
  path: string
  scope: string
  size: number
  source: "global" | "project"
}

export type SessionCapturedContextSkillGroup = {
  path: string
  skillNames: readonly string[]
}

export type SessionCapturedContextTool = {
  agentId: string
  isPrimary: boolean
  toolNames: readonly string[]
}

export type SessionCapturedContextInspectorState = {
  agentPrompt: () => string
  agentPromptEstimatedTokens: () => number
  errorMessage: () => string | null
  /** False while the session predates execution-context capture. */
  hasCapture: () => boolean
  instructionEstimatedTokens: () => number
  instructions: () => readonly SessionCapturedContextInstruction[]
  isLoading: () => boolean
  presetName: () => string | null
  retry: () => void
  skillGroups: () => readonly SessionCapturedContextSkillGroup[]
  skills: () => readonly { description: string; name: string; source: "global" | "project" }[]
  tools: () => readonly SessionCapturedContextTool[]
  totalEstimatedTokens: () => number
}

function sessionCapturedContextEstimatedTokens(characterCount: number): number {
  return Math.ceil(characterCount / 4)
}

/**
 * Projects the immutable execution context a session captured at creation into the
 * few inputs that stay useful for debugging: the effective agent prompt, the
 * included AGENTS.md sources with their paths and size estimates, and the selected
 * skill groups, skills, and tools. Digests, resource bundles, and live discovery
 * diagnostics are deliberately dropped, because they describe the filesystem rather
 * than what the session actually ran with.
 */
export function sessionCapturedContextInspectorStateCreate(
  resources: () => SessionResourceSelectorView,
): SessionCapturedContextInspectorState {
  const instructions = (): readonly SessionCapturedContextInstruction[] =>
    resources()
      .instructionSnapshots()
      .map((snapshot) => ({
        canonicalPath: snapshot.canonicalPath,
        ...(snapshot.content === undefined ? {} : { content: snapshot.content }),
        estimatedTokens: sessionCapturedContextEstimatedTokens(snapshot.content?.length ?? snapshot.size),
        path: snapshot.path,
        scope: snapshot.scope,
        size: snapshot.size,
        source: snapshot.source,
      }))

  const instructionEstimatedTokens = () => instructions().reduce((total, entry) => total + entry.estimatedTokens, 0)

  const skillGroups = (): readonly SessionCapturedContextSkillGroup[] => {
    const grouped = new Map<string, string[]>()
    for (const skill of resources().existingExecutionResources()?.skills ?? []) {
      const names = grouped.get(skill.bundlePath)
      if (names === undefined) {
        grouped.set(skill.bundlePath, [skill.name])
        continue
      }
      names.push(skill.name)
    }
    return [...grouped.entries()]
      .map(([path, skillNames]) => ({ path, skillNames }))
      .sort((left, right) => left.path.localeCompare(right.path))
  }

  const tools = (): readonly SessionCapturedContextTool[] =>
    resources()
      .agentTools()
      .map((agent) => ({
        agentId: agent.agentId,
        isPrimary: agent.isPrimary,
        toolNames: [...(agent.bash ? ["bash"] : []), ...(agent.webfetch ? ["webfetch"] : [])],
      }))

  return {
    agentPrompt: () => resources().agentPrompt() ?? "",
    agentPromptEstimatedTokens: () => resources().agentPromptEstimatedTokens(),
    errorMessage: () => resources().errorMessage(),
    hasCapture: () => resources().existingExecutionResources() !== null,
    instructionEstimatedTokens,
    instructions,
    isLoading: () => resources().status() === "loading",
    presetName: () => resources().presetName(),
    retry: () => resources().retry(),
    skillGroups,
    skills: () =>
      resources()
        .activeSkills()
        .map(({ description, name, source }) => ({ description, name, source })),
    tools,
    totalEstimatedTokens: () => resources().agentPromptEstimatedTokens() + instructionEstimatedTokens(),
  }
}
