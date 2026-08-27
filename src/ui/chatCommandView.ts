import type { CommandInspectionSnapshot } from "../commands/api/commandInspectionSnapshotSchema.js"
import type { CommandInvocation } from "../commands/schema/commandInvocationSchema.js"

export type ChatCommandSuggestion = {
  agent?: string
  description?: string
  /** True while this row is the keyboard/pointer active descendant. */
  isHighlighted: boolean
  model?: string
  name: string
  source: "global" | "project"
  subtask: boolean
}

export type ChatCommandPreview = {
  agent?: string
  argumentsText: string
  /** Positional and `$ARGUMENTS` placeholders the template declares, in order. */
  declaredPlaceholders: readonly string[]
  description?: string
  /** Locally rendered expansion. Shell interpolation is resolved by the server. */
  expandedText: string
  hasShellInterpolation: boolean
  model?: string
  name: string
  source: "global" | "project"
  subtask: boolean
  templateDigest: string
}

/**
 * Rendering contract of the composer's slash-command affordance, so production
 * state and demo fixtures supply the same suggestion list, detail preview, and
 * deterministic validation message without the view owning any of them.
 */
export type ChatCommandComposerView = {
  /** Typed command identity submitted alongside the prompt, when the draft resolves. */
  invocation: () => CommandInvocation | undefined
  /** Closes the suggestion listbox for the current draft without changing it. */
  dismiss: () => void
  /** True while the draft opens with a slash, so the composer owns the arrow keys. */
  isCommandDraft: () => boolean
  /** True while the suggestion listbox should be rendered and navigable. */
  isSuggesting: () => boolean
  /** Element id of the highlighted option, for `aria-activedescendant`. */
  highlightedOptionId: () => string | undefined
  highlightEdge: (edge: "first" | "last") => void
  highlightMove: (delta: number) => void
  highlightSet: (name: string) => void
  listboxId: () => string
  optionId: (name: string) => string
  preview: () => ChatCommandPreview | undefined
  /** Deterministic validation or interpolation error for the current draft. */
  errorMessage: () => string | undefined
  /** Replaces the draft's command token with the highlighted or named command. */
  select: (name?: string) => void
  status: () => "error" | "loading" | "ready" | "unavailable"
  statusMessage: () => string | undefined
  suggestions: () => readonly ChatCommandSuggestion[]
  retry: () => void
}

export type ChatCommandCatalogSource = {
  commands: () => readonly CommandInspectionSnapshot[]
  /** False when the primary agent cannot run `!`command`` interpolation. */
  isBashEnabled: () => boolean
  errorMessage: () => string | undefined
  retry: () => void
  status: () => "error" | "loading" | "ready" | "unavailable"
}
