import type { AnyTextAdapter, ModelMessage } from "@tanstack/ai"
import type { CliProxyApiAdapter, CliProxyApiAdapterInput } from "./cliProxyApiAdapterCreate.js"
import type {
  ProviderDelegationToolLoop,
  ProviderDelegationToolLoopOptions,
} from "./providerDelegationToolLoopCreate.js"
import { providerDelegationToolLoopCreate } from "./providerDelegationToolLoopCreate.js"

type ProviderDelegationAdapterCreateOptions = {
  adapter: CliProxyApiAdapter
  delegateTask: ProviderDelegationToolLoopOptions["delegateTask"]
  model: string
  toolLoopCreate?: typeof providerDelegationToolLoopCreate
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

function providerDelegationAdapterModelCreate(options: ProviderDelegationAdapterCreateOptions): AnyTextAdapter {
  return {
    chatStream: (input: Parameters<AnyTextAdapter["chatStream"]>[0]) =>
      options.adapter({
        history: input.messages as never,
        prompt: providerDelegationPromptResolve(input.messages),
        runId: input.runId ?? input.threadId ?? "delegation-run",
        sessionId: input.threadId ?? "delegation-session",
        signal: input.abortController?.signal ?? new AbortController().signal,
        ...(input.tools === undefined ? {} : { tools: input.tools }),
      }),
    kind: "text",
    model: options.model,
    name: "codeline-delegation",
    structuredOutput: async () => ({ data: {}, rawText: "{}" }),
  } as unknown as AnyTextAdapter
}

export function providerDelegationAdapterCreate(options: ProviderDelegationAdapterCreateOptions): CliProxyApiAdapter {
  const loopCreate = options.toolLoopCreate ?? providerDelegationToolLoopCreate
  const loop: ProviderDelegationToolLoop = loopCreate({
    adapter: providerDelegationAdapterModelCreate(options),
    delegateTask: options.delegateTask,
  })

  return (input) =>
    loop({
      messages: providerDelegationMessagesResolve(input),
      runId: input.runId,
      signal: input.signal,
      threadId: input.sessionId,
    })
}
