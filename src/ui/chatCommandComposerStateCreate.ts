import * as v from "valibot"
import { commandArgumentsTokenize } from "../commands/actions/commandArgumentsTokenize.js"
import { commandTemplateExpand, commandTemplatePlaceholderNames } from "../commands/actions/commandTemplateExpand.js"
import type { CommandInspectionSnapshot } from "../commands/api/commandInspectionSnapshotSchema.js"
import { type CommandInvocation, commandInvocationSchema } from "../commands/schema/commandInvocationSchema.js"
import { commandNameSchema } from "../commands/schema/commandNameSchema.js"
import { chatCommandDraftParse } from "./chatCommandDraftParse.js"
import type { ChatCommandCatalogSource, ChatCommandComposerView, ChatCommandPreview } from "./chatCommandView.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type ChatCommandComposerStateOptions = {
  catalog: ChatCommandCatalogSource
  draft: () => string
  draftUpdate: (value: string) => void
  /** Distinguishes the pre-session composer's listbox ids from a session's. */
  idPrefix?: string
}

const suggestionLimit = 30
const shellInterpolationPattern = /!`([\s\S]*?)`/u

function chatCommandSuggestionRank(command: CommandInspectionSnapshot, token: string): number | undefined {
  if (token.length === 0) return 2
  const name = command.name
  if (name === token) return 0
  if (name.startsWith(token)) return 1
  if (name.includes(token)) return 2
  // A trailing segment match keeps `commit` finding `git/commit`.
  if (name.split("/").some((segment) => segment.startsWith(token))) return 3
  return undefined
}

/**
 * Slash-command autocomplete and detail preview for one composer. The state owns
 * the draft interpretation, the highlighted suggestion, the locally rendered
 * expansion preview, and every deterministic validation message, so the composer
 * view stays a pure projection and the submitted invocation is typed.
 */
export function chatCommandComposerStateCreate(options: ChatCommandComposerStateOptions): ChatCommandComposerView {
  const prefix = options.idPrefix ?? "chat-command"
  const highlightedName = signalObjectCreate<string | null>(null)
  // Dismissal is scoped to the exact draft it was requested for, so continuing to
  // type reopens the list instead of leaving the user without the affordance.
  const dismissedDraft = signalObjectCreate<string | null>(null)

  const draftParsed = () => chatCommandDraftParse(options.draft())
  const isCommandDraft = () => draftParsed() !== undefined
  const token = () => draftParsed()?.token ?? ""

  const commandFind = (name: string) => options.catalog.commands().find((command) => command.name === name)

  const matches = () => {
    const parsed = draftParsed()
    if (parsed === undefined) return []
    const search = parsed.token.toLowerCase()
    return options.catalog
      .commands()
      .map((command) => ({ command, rank: chatCommandSuggestionRank(command, search) }))
      .filter((entry): entry is { command: CommandInspectionSnapshot; rank: number } => entry.rank !== undefined)
      .sort((left, right) => left.rank - right.rank || left.command.name.localeCompare(right.command.name))
      .slice(0, suggestionLimit)
      .map(({ command }) => command)
  }

  // While the name is still being typed the list is the primary affordance; once a
  // separator is typed the draft has committed to one command and the detail
  // preview replaces the list so arguments can be written without interference.
  const isSuggesting = () =>
    isCommandDraft() &&
    draftParsed()?.isNameComplete !== true &&
    options.catalog.status() === "ready" &&
    dismissedDraft.get() !== options.draft()

  const highlighted = () => {
    const available = matches()
    if (available.length === 0) return undefined
    const name = highlightedName.get()
    return available.find((command) => command.name === name) ?? available[0]
  }

  const selectedCommand = () => {
    const parsed = draftParsed()
    if (parsed === undefined) return undefined
    if (!parsed.isNameComplete) return undefined
    return commandFind(parsed.token)
  }

  const argumentsTokenized = () => {
    const parsed = draftParsed()
    if (parsed === undefined) return undefined
    return commandArgumentsTokenize(parsed.argumentsText)
  }

  const preview = (): ChatCommandPreview | undefined => {
    const command = selectedCommand()
    const parsed = draftParsed()
    const tokenized = argumentsTokenized()
    if (command === undefined || parsed === undefined || tokenized === undefined || !tokenized.success) return undefined
    const expanded = commandTemplateExpand(command.template, tokenized.data.text, tokenized.data.values)
    if (!expanded.success) return undefined
    return {
      ...(command.agent === undefined ? {} : { agent: command.agent }),
      argumentsText: tokenized.data.text,
      declaredPlaceholders: commandTemplatePlaceholderNames(command.template),
      ...(command.description === undefined ? {} : { description: command.description }),
      expandedText: expanded.data,
      hasShellInterpolation: shellInterpolationPattern.test(expanded.data),
      ...(command.model === undefined ? {} : { model: command.model }),
      name: command.name,
      source: command.source,
      subtask: command.subtask === true,
      templateDigest: command.templateDigest,
    }
  }

  const errorMessage = () => {
    const parsed = draftParsed()
    if (parsed === undefined) return undefined
    if (options.catalog.status() === "error")
      return options.catalog.errorMessage() ?? "The command catalog could not be loaded."
    if (options.catalog.status() !== "ready") return undefined
    if (parsed.token.length === 0) return "Type a command name after the slash."
    if (!v.safeParse(commandNameSchema, parsed.token).success)
      return `"${parsed.token}" is not a valid command name. Use lowercase letters, digits, "-", "_", ".", or "/".`
    const command = commandFind(parsed.token)
    if (command === undefined) {
      if (!parsed.isNameComplete && matches().length > 0) return undefined
      return `The command "/${parsed.token}" could not be found in this project.`
    }
    const tokenized = argumentsTokenized()
    if (tokenized !== undefined && !tokenized.success) return tokenized.errorMessage
    const expanded = commandTemplateExpand(
      command.template,
      tokenized?.success === true ? tokenized.data.text : "",
      tokenized?.success === true ? tokenized.data.values : [],
    )
    if (!expanded.success) return expanded.errorMessage
    if (shellInterpolationPattern.test(expanded.data) && !options.catalog.isBashEnabled())
      return "This command uses !`...` shell interpolation, which requires the bash tool to be enabled for the primary agent."
    return undefined
  }

  const invocation = (): CommandInvocation | undefined => {
    const parsed = draftParsed()
    if (parsed === undefined || errorMessage() !== undefined) return undefined
    const command = commandFind(parsed.token)
    if (command === undefined) return undefined
    const result = v.safeParse(commandInvocationSchema, { arguments: parsed.argumentsText, name: command.name })
    return result.success ? result.output : undefined
  }

  const select = (name?: string) => {
    const target = name ?? highlighted()?.name
    if (target === undefined || commandFind(target) === undefined) return
    const parsed = draftParsed()
    const args = parsed?.argumentsText ?? ""
    highlightedName.set(target)
    options.draftUpdate(args.length === 0 ? `/${target} ` : `/${target} ${args}`)
  }

  const highlightMove = (delta: number) => {
    const available = matches()
    if (available.length === 0) return
    const current = highlighted()
    const index = current === undefined ? 0 : available.findIndex(({ name }) => name === current.name)
    const next = (((index + delta) % available.length) + available.length) % available.length
    highlightedName.set(available[next]?.name ?? null)
  }

  return {
    dismiss: () => dismissedDraft.set(options.draft()),
    errorMessage,
    highlightEdge: (edge: "first" | "last") => {
      const available = matches()
      if (available.length === 0) return
      highlightedName.set((edge === "first" ? available[0] : available[available.length - 1])?.name ?? null)
    },
    highlightedOptionId: () => {
      if (!isSuggesting()) return undefined
      const current = highlighted()
      return current === undefined ? undefined : `${prefix}-option-${current.name}`
    },
    highlightMove,
    highlightSet: (name: string) => {
      if (commandFind(name) === undefined) return
      highlightedName.set(name)
    },
    invocation,
    isCommandDraft,
    isSuggesting,
    listboxId: () => `${prefix}-listbox`,
    optionId: (name: string) => `${prefix}-option-${name}`,
    preview,
    retry: options.catalog.retry,
    select,
    status: options.catalog.status,
    statusMessage: () => {
      if (!isCommandDraft()) return undefined
      if (options.catalog.status() === "loading") return "Loading commands..."
      if (options.catalog.status() === "unavailable") return "Commands are unavailable for this conversation."
      if (options.catalog.status() === "ready" && matches().length === 0 && token().length > 0)
        return `No command matches "${token()}".`
      return undefined
    },
    suggestions: () => {
      if (!isSuggesting()) return []
      const current = highlighted()
      return matches().map((command) => ({
        ...(command.agent === undefined ? {} : { agent: command.agent }),
        ...(command.description === undefined ? {} : { description: command.description }),
        isHighlighted: command.name === current?.name,
        ...(command.model === undefined ? {} : { model: command.model }),
        name: command.name,
        source: command.source,
        subtask: command.subtask === true,
      }))
    },
  }
}
