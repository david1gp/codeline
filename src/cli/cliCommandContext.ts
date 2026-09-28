import type { Terminal } from "@earendil-works/pi-tui"
import type { CommandContext, StricliProcess } from "@stricli/core"
import type { cliConversationCreate } from "./cliConversationCreate.js"
import type { cliLocalRuntimeCreate } from "./cliLocalRuntimeCreate.js"
import type { cliPollingDelay } from "./cliPollingDelay.js"

export type CliCommandContext = Omit<CommandContext, "process"> & {
  process: StricliProcess
  configPath: string
  env?: Readonly<Record<string, string | undefined>>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onInterrupt?: (handler: () => void) => () => void
  onTerminate?: (handler: () => void) => () => void
  terminal?: Terminal
  conversationCreate?: typeof cliConversationCreate
  pollingDelay?: typeof cliPollingDelay
  cwd?: string
  localRuntimeCreate?: typeof cliLocalRuntimeCreate
}
