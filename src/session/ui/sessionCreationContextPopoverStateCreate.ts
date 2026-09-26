import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

export type SessionCreationContextSource = {
  /** Absolute file path of the merged instruction source, so debugging can locate it. */
  canonicalPath: string | undefined
  characterCount: number
  content: string
  estimatedTokens: number
  /** False for captured sources that no longer carry editable content. */
  isEditable: boolean
  /** Project-relative path used as the human label. */
  path: string
  scope: string
  source: "global" | "project"
}

export type SessionCreationContextPopoverState = {
  agentPrompt: () => string
  agentPromptChange: (value: string) => void
  agentPromptEstimatedTokens: () => number
  isMutable: () => boolean
  open: () => boolean
  openChange: (open: boolean) => void
  sourceContentChange: (canonicalPath: string, value: string) => void
  sources: () => readonly SessionCreationContextSource[]
  totalCharacterCount: () => number
  totalEstimatedTokens: () => number
}

function sessionCreationContextEstimatedTokens(characterCount: number): number {
  return Math.ceil(characterCount / 4)
}

/**
 * Derives the editable prompt and merged instruction sources with their canonical
 * paths and context-size estimates, so the creation popover only renders values
 * that the session-scoped resource selection already owns.
 */
export function sessionCreationContextPopoverStateCreate(
  resources: () => SessionResourceSelectorView,
): SessionCreationContextPopoverState {
  const sources = (): readonly SessionCreationContextSource[] =>
    resources()
      .instructionSnapshots()
      .map((snapshot) => {
        const canonicalPath = snapshot.canonicalPath
        const edited = canonicalPath === undefined ? undefined : resources().instructionContent(canonicalPath)
        const content = edited ?? snapshot.content ?? ""
        const characterCount = edited !== undefined || snapshot.content !== undefined ? content.length : snapshot.size

        return {
          canonicalPath,
          characterCount,
          content,
          estimatedTokens: sessionCreationContextEstimatedTokens(characterCount),
          isEditable: canonicalPath !== undefined && edited !== undefined && resources().isMutable(),
          path: snapshot.path,
          scope: snapshot.scope,
          source: snapshot.source,
        }
      })

  const totalCharacterCount = () =>
    resources().agentPromptCharacterCount() + sources().reduce((total, entry) => total + entry.characterCount, 0)

  return {
    agentPrompt: () => resources().agentPrompt() ?? "",
    agentPromptChange: (value: string) => resources().agentPromptChange(value),
    agentPromptEstimatedTokens: () => resources().agentPromptEstimatedTokens(),
    isMutable: () => resources().isMutable(),
    open: () => resources().inspectorOpen(),
    openChange: (open: boolean) => resources().inspectorOpenChange(open),
    sourceContentChange: (canonicalPath: string, value: string) =>
      resources().instructionContentChange(canonicalPath, value),
    sources,
    totalCharacterCount,
    totalEstimatedTokens: () => sessionCreationContextEstimatedTokens(totalCharacterCount()),
  }
}
