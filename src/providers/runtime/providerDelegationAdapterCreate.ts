import type { AnyTextAdapter, ModelMessage } from "@tanstack/ai"
import type { SkillDescriptionCatalog } from "../../skills/schema/skillDescriptionCatalogSchema.js"
import type { SkillSnapshot } from "../../skills/schema/skillSnapshotSchema.js"
import type { BashToolCreateOptions } from "../../tools/runtime/bashToolCreate.js"
import { type DelegateTaskToolExecute, delegateTaskToolCreate } from "../../tools/runtime/delegateTaskToolCreate.js"
import type { ToolRegistry } from "../../tools/runtime/toolRegistry.js"
import { toolRegistryCreate } from "../../tools/runtime/toolRegistryCreate.js"
import type { WebfetchToolCreateOptions } from "../../tools/runtime/webfetchToolCreate.js"
import type { ToolName } from "../../tools/schema/toolNameSchema.js"
import type { CliProxyApiAdapter, CliProxyApiAdapterInput } from "./cliProxyApiAdapterCreate.js"
import type { ProviderDelegationToolLoop } from "./providerDelegationToolLoopCreate.js"
import { providerDelegationToolLoopCreate } from "./providerDelegationToolLoopCreate.js"
import type { ProviderInstructionContext } from "./providerInstructionContext.js"

type ProviderDelegationAdapterCreateOptions = {
  adapter: CliProxyApiAdapter
  bash?: BashToolCreateOptions
  delegateTask?: DelegateTaskToolExecute
  enabledTools?: readonly ToolName[]
  instructionContext?: ProviderInstructionContext
  model: string
  skillDescriptionCatalog?: SkillDescriptionCatalog
  skillSnapshots?: readonly SkillSnapshot[]
  systemPrompt?: string
  toolRegistry?: ToolRegistry
  toolLoopCreate?: typeof providerDelegationToolLoopCreate
  webfetch?: WebfetchToolCreateOptions
}

function providerDelegationPromptResolve(messages: Array<ModelMessage>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== "user") continue
    return typeof message.content === "string" ? message.content : JSON.stringify(message.content)
  }
  return ""
}

function providerDelegationMessagesResolve(input: CliProxyApiAdapterInput): Array<ModelMessage> {
  const messages: Array<ModelMessage> = []
  for (const message of input.history as Array<{
    content: unknown
    role: string
    toolCallId?: string
    toolCalls?: ModelMessage["toolCalls"]
  }>) {
    if (message.role !== "user" && message.role !== "assistant" && message.role !== "tool") continue
    messages.push({
      content:
        typeof message.content === "string" || message.content === null || Array.isArray(message.content)
          ? message.content
          : JSON.stringify(message.content),
      role: message.role,
      ...(message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId }),
      ...(message.toolCalls === undefined ? {} : { toolCalls: message.toolCalls }),
    } as ModelMessage)
  }

  const last = messages.at(-1)
  if (last?.role !== "user" || last.content !== input.prompt) messages.push({ content: input.prompt, role: "user" })
  return messages
}

function providerDelegationSystemPromptResolve(
  systemPrompts: Array<string | { content: string }> | undefined,
): string | undefined {
  if (systemPrompts === undefined || systemPrompts.length === 0) return undefined
  const prompt = systemPrompts.map((entry) => (typeof entry === "string" ? entry : entry.content)).join("\n\n")
  return prompt.length === 0 ? undefined : prompt
}

function providerDelegationAdapterModelCreate(options: ProviderDelegationAdapterCreateOptions): AnyTextAdapter {
  return {
    chatStream: (input: Parameters<AnyTextAdapter["chatStream"]>[0]) => {
      const systemPrompt = providerDelegationSystemPromptResolve(input.systemPrompts)
      return options.adapter({
        history: input.messages as never,
        prompt: providerDelegationPromptResolve(input.messages),
        runId: input.runId ?? input.threadId ?? "delegation-run",
        sessionId: input.threadId ?? "delegation-session",
        signal: input.abortController?.signal ?? new AbortController().signal,
        ...(input.tools === undefined ? {} : { tools: input.tools }),
        ...(systemPrompt === undefined ? {} : { systemPrompt }),
      })
    },
    kind: "text",
    model: options.model,
    name: "codeline-delegation",
    structuredOutput: async () => ({ data: {}, rawText: "{}" }),
  } as unknown as AnyTextAdapter
}

export function providerDelegationAdapterCreate(options: ProviderDelegationAdapterCreateOptions): CliProxyApiAdapter {
  const loopCreate = options.toolLoopCreate ?? providerDelegationToolLoopCreate
  const toolRegistry = options.toolRegistry ?? toolRegistryCreate()
  if (options.delegateTask !== undefined && toolRegistry.get("delegate_task") === undefined)
    toolRegistry.register(delegateTaskToolCreate({ execute: options.delegateTask }))
  const loop: ProviderDelegationToolLoop = loopCreate({
    adapter: providerDelegationAdapterModelCreate(options),
    ...(options.bash === undefined ? {} : { bash: options.bash }),
    ...(options.delegateTask === undefined ? {} : { delegateTask: options.delegateTask }),
    ...(options.enabledTools === undefined ? {} : { enabledTools: options.enabledTools }),
    ...(options.instructionContext === undefined ? {} : { instructionContext: options.instructionContext }),
    ...(options.skillDescriptionCatalog === undefined
      ? {}
      : { skillDescriptionCatalog: options.skillDescriptionCatalog }),
    ...(options.skillSnapshots === undefined ? {} : { skillSnapshots: options.skillSnapshots }),
    ...(options.systemPrompt === undefined ? {} : { systemPrompt: options.systemPrompt }),
    toolRegistry,
    ...(options.webfetch === undefined ? {} : { webfetch: options.webfetch }),
  })

  return (input) =>
    loop({
      messages: providerDelegationMessagesResolve(input),
      runId: input.runId,
      signal: input.signal,
      threadId: input.sessionId,
    })
}
